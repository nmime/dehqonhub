import { Injectable } from '@nestjs/common';
import type {
  HealthCheckKind,
  HealthIndicator,
  HealthIndicatorResult,
  HealthIndicatorStatus,
  HealthResponse,
  HealthResponseDto,
  HealthSafeDetails,
} from './dto';
import { toHealthResponseDto } from './mapper';
import { resolveHealthStatus } from './util/health-status.util';
import { sanitizeHealthDetails } from './util/health-sanitize.util';

export interface HealthServiceOptions {
  appName?: string;
  indicators?: readonly HealthIndicator[];
  /**
   * Upper bound for a single indicator. A hung dependency must fail the probe
   * instead of hanging it, so an indicator that exceeds this budget is reported
   * as an error. Dependency indicators carry their own tighter timeout; this is
   * the backstop for any indicator that forgets one.
   */
  indicatorTimeoutMs?: number;
}

const defaultAppName = 'app';
const defaultIndicatorTimeoutMs = 5_000;

class HealthIndicatorTimeoutError extends Error {}

@Injectable()
export class HealthService {
  readonly appName: string;
  private readonly indicators: readonly HealthIndicator[];
  private readonly indicatorTimeoutMs: number;

  constructor(options: HealthServiceOptions | readonly HealthIndicator[] = {}) {
    if (isHealthIndicatorList(options)) {
      this.appName = defaultAppName;
      this.indicators = options;
      this.indicatorTimeoutMs = defaultIndicatorTimeoutMs;
      return;
    }

    this.appName = options.appName ?? defaultAppName;
    this.indicators = options.indicators ?? [];
    this.indicatorTimeoutMs = options.indicatorTimeoutMs ?? defaultIndicatorTimeoutMs;
  }

  async check(kind: HealthCheckKind = 'health'): Promise<HealthResponse> {
    const checks = await this.runIndicators(kind);

    return {
      status: resolveHealthStatus(checks),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  async checkEnvelope(kind: HealthCheckKind = 'health'): Promise<HealthResponseDto> {
    return toHealthResponseDto(this.appName, await this.check(kind));
  }

  async checkReadiness(): Promise<HealthResponseDto> {
    return this.checkEnvelope('ready');
  }

  async checkLiveness(): Promise<HealthResponseDto> {
    return this.checkEnvelope('live');
  }

  async checkPrivate(): Promise<HealthResponseDto> {
    return this.checkEnvelope('private');
  }

  private async runIndicators(kind: HealthCheckKind): Promise<HealthIndicatorResult[]> {
    // Liveness must only prove the process is alive: run no dependency
    // indicators, only those explicitly marked liveness-safe. Otherwise a
    // transient dependency blip would fail liveness and Kubernetes would
    // restart an otherwise healthy pod. Readiness/health run every indicator.
    const indicators =
      kind === 'live' ? this.indicators.filter((indicator) => indicator.livenessSafe === true) : this.indicators;

    return Promise.all(indicators.map((indicator) => this.runIndicator(indicator, kind)));
  }

  private async runIndicator(indicator: HealthIndicator, kind: HealthCheckKind): Promise<HealthIndicatorResult> {
    const startedAt = performance.now();
    try {
      return normalizeIndicatorResult(
        indicator,
        await withIndicatorTimeout(indicator.check({ appName: this.appName, kind }), this.indicatorTimeoutMs),
        performance.now() - startedAt,
      );
    } catch (error) {
      return normalizeIndicatorResult(
        indicator,
        {
          name: indicator.name,
          status: 'error',
          required: indicator.required,
          details: {
            message:
              error instanceof HealthIndicatorTimeoutError ? 'Health indicator timed out.' : 'Health indicator failed.',
          },
        },
        performance.now() - startedAt,
      );
    }
  }
}

function isHealthIndicatorList(
  options: HealthServiceOptions | readonly HealthIndicator[],
): options is readonly HealthIndicator[] {
  return Array.isArray(options);
}

async function withIndicatorTimeout<T>(operation: Promise<T> | T, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new HealthIndicatorTimeoutError());
    }, timeoutMs);
    timeout.unref();
  });

  try {
    return await Promise.race([operation, expiry]);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeIndicatorResult(
  indicator: HealthIndicator,
  result: HealthIndicatorResult,
  durationMs: number,
): HealthIndicatorResult {
  const required = result.required ?? indicator.required ?? true;

  return {
    ...result,
    name: result.name || indicator.name,
    status: normalizeStatus(result.status, required, result.details),
    required,
    durationMs: Math.round(durationMs),
    details: sanitizeHealthDetails(result.details),
  };
}

/**
 * A required check that cannot fail is worse than no check at all: an indicator
 * that reports success without executing would let readiness stay green while
 * the dependency it claims to prove is gone. A required indicator that did not
 * run is therefore reported as an error, never as healthy.
 */
function normalizeStatus(
  status: HealthIndicatorStatus,
  required: boolean,
  details: HealthSafeDetails | undefined,
): HealthIndicatorStatus {
  if (required && (status === 'skipped' || details?.skipped === true)) {
    return 'error';
  }

  return status;
}
