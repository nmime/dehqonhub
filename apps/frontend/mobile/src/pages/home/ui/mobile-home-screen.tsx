// @requirements REQ-AGRITECH-FULFILLMENT-010
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { designColors, designRadii, designSpacing } from '@app/frontend-ui-native';
import { useI18n, type Locale } from '@app/frontend-runtime';
import {
  throwOnOpenApiErrorData,
  useUserApiClient,
  type AssignedFarmerViewDto,
  type DeliveryViewDto,
} from '@app/frontend-api-client';

import { useMobileRuntime } from '../../../shared';
import { mobileCapabilityCards, mobileLocaleOptions } from '../model/mobile-home.model';

const colors = designColors.light;

function nextDeliveryStatus(status: DeliveryViewDto['status']): 'picked_up' | 'in_transit' | 'delivered' {
  if (status === 'assigned') {
    return 'picked_up';
  }
  if (status === 'picked_up') {
    return 'in_transit';
  }
  return 'delivered';
}

export function MobileHomeScreen() {
  const { locale, t } = useI18n();
  const { applyUserLocale, persistUserLocale, userLocale } = useMobileRuntime();
  const { api, requestOptions } = useUserApiClient();
  const activeLocale = userLocale ?? locale;
  const [farmers, setFarmers] = useState<AssignedFarmerViewDto[]>([]);
  const [selectedFarmerId, setSelectedFarmerId] = useState('');
  const [deliveries, setDeliveries] = useState<DeliveryViewDto[]>([]);
  const [workState, setWorkState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notes, setNotes] = useState('');
  const [grade, setGrade] = useState<'A' | 'B' | 'C'>('A');
  const [proof, setProof] = useState('');
  const [notice, setNotice] = useState('');

  const loadWork = useCallback(async () => {
    setWorkState('loading');
    try {
      const [farmerData, deliveryData] = await Promise.all([
        throwOnOpenApiErrorData(api.agriTechOperationsControllerListAssignedFarmers(requestOptions)),
        throwOnOpenApiErrorData(api.agriTechOperationsControllerListDeliveries(requestOptions)),
      ]);
      setFarmers(farmerData.items);
      setSelectedFarmerId((current) =>
        farmerData.items.some((farmer) => farmer.id === current) ? current : (farmerData.items[0]?.id ?? ''),
      );
      setDeliveries(deliveryData.items);
      setWorkState('ready');
    } catch {
      setWorkState('error');
    }
  }, [api, requestOptions]);

  useEffect(() => {
    void loadWork();
  }, [loadWork]);

  const recordVisit = async () => {
    const farmer = farmers.find((candidate) => candidate.id === selectedFarmerId);
    if (!farmer || !notes.trim()) {
      return;
    }
    try {
      await throwOnOpenApiErrorData(
        api.agriTechOperationsControllerRecordFieldVisit(
          { farmerId: farmer.id, notes: notes.trim(), observedGrade: grade, observedAt: new Date().toISOString() },
          requestOptions,
        ),
      );
      setNotes('');
      setNotice(t('mobile.work.saved'));
    } catch {
      setNotice(t('mobile.work.actionError'));
    }
  };

  const advanceDelivery = async (delivery: DeliveryViewDto) => {
    const next = nextDeliveryStatus(delivery.status);
    if (next === 'delivered' && !proof.trim()) {
      setNotice(t('mobile.work.proofRequired'));
      return;
    }
    try {
      await throwOnOpenApiErrorData(
        api.agriTechOperationsControllerTransitionDelivery(
          delivery.id,
          { status: next, ...(next === 'delivered' ? { proofReference: proof.trim() } : {}) },
          requestOptions,
        ),
      );
      setProof('');
      setNotice(t('mobile.work.saved'));
      await loadWork();
    } catch {
      setNotice(t('mobile.work.actionError'));
    }
  };

  const selectLocale = (next: Locale) => {
    applyUserLocale(next);
    void persistUserLocale(next);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('mobile.status')}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {t('mobile.appName')}
          </Text>
          <Text style={styles.subtitle}>{t('mobile.subtitle')}</Text>
          <View accessibilityRole="radiogroup" style={styles.langRow}>
            {mobileLocaleOptions.map((option) => {
              const selected = activeLocale === option.locale;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.locale}
                  onPress={() => {
                    selectLocale(option.locale);
                  }}
                  style={[styles.langButton, selected && styles.langButtonActive]}
                >
                  <Text style={[styles.langButtonText, selected && styles.langButtonTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelAccent} />
          <Text style={styles.panelLabel}>{t('mobile.api.label')}</Text>
          <Text style={styles.panelValue}>{t('mobile.api.value')}</Text>
        </View>

        <View style={styles.grid}>
          {mobileCapabilityCards.map((card) => (
            <View key={card.labelKey} style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardLabel}>{t(card.labelKey)}</Text>
              <Text style={styles.cardValue}>{t(card.valueKey)}</Text>
              <Text style={styles.cardDetail}>{t(card.detailKey)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>{t('mobile.work.farmers')}</Text>
          {workState === 'loading' && <Text>{t('common.loading')}</Text>}
          {workState === 'error' && (
            <Pressable onPress={() => void loadWork()} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>{t('ui.runtime.retry')}</Text>
            </Pressable>
          )}
          {workState === 'ready' && farmers.length === 0 && <Text>{t('mobile.work.empty')}</Text>}
          {farmers.map((farmer) => {
            const selected = farmer.id === selectedFarmerId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={farmer.id}
                onPress={() => {
                  setSelectedFarmerId(farmer.id);
                }}
                style={[styles.farmerButton, selected && styles.farmerButtonSelected]}
              >
                <Text style={styles.workItem}>
                  {farmer.firstName} {farmer.lastName} · {farmer.region} · {farmer.crops.join(', ')}
                </Text>
              </Pressable>
            );
          })}
          {farmers.length > 0 && (
            <>
              <TextInput
                accessibilityLabel={t('mobile.work.visitNotes')}
                multiline
                onChangeText={setNotes}
                placeholder={t('mobile.work.visitNotes')}
                style={styles.input}
                value={notes}
              />
              <Text style={styles.inputLabel}>{t('mobile.work.grade')}</Text>
              <View accessibilityRole="radiogroup" style={styles.langRow}>
                {(['A', 'B', 'C'] as const).map((option) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: grade === option }}
                    key={option}
                    onPress={() => {
                      setGrade(option);
                    }}
                    style={[styles.langButton, grade === option && styles.langButtonActive]}
                  >
                    <Text style={[styles.langButtonText, grade === option && styles.langButtonTextActive]}>
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => void recordVisit()} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>{t('mobile.work.recordVisit')}</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>{t('mobile.work.deliveries')}</Text>
          {deliveries.length === 0 && <Text>{t('mobile.work.empty')}</Text>}
          <TextInput
            accessibilityLabel={t('mobile.work.proof')}
            onChangeText={setProof}
            placeholder={t('mobile.work.proof')}
            style={styles.input}
            value={proof}
          />
          {deliveries
            .filter((delivery) => !['delivered', 'cancelled'].includes(delivery.status))
            .map((delivery) => (
              <View key={delivery.id} style={styles.workItemRow}>
                <Text style={styles.workItem}>
                  {delivery.orderId} · {delivery.status}
                </Text>
                <Pressable onPress={() => void advanceDelivery(delivery)} style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>{t('mobile.work.advance')}</Text>
                </Pressable>
              </View>
            ))}
        </View>
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {notice}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  page: {
    flexGrow: 1,
    alignSelf: 'center',
    maxWidth: 760,
    width: '100%',
    padding: designSpacing[6],
  },
  header: {
    marginBottom: designSpacing[6],
  },
  langRow: {
    flexDirection: 'row',
    gap: designSpacing[2],
    marginTop: designSpacing[4],
  },
  langButton: {
    borderColor: colors.border,
    borderRadius: designRadii.sm,
    borderWidth: 1,
    paddingHorizontal: designSpacing[4],
    paddingVertical: designSpacing[2],
  },
  langButtonActive: {
    backgroundColor: colors.ring,
    borderColor: colors.ring,
  },
  langButtonText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700',
  },
  langButtonTextActive: {
    color: colors.primaryForeground,
  },
  eyebrow: {
    alignSelf: 'flex-start',
    borderRadius: designRadii.sm,
    backgroundColor: colors.accent,
    color: '#1e3a8a',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: designSpacing[3],
    paddingHorizontal: designSpacing[3],
    paddingVertical: designSpacing[2],
    textTransform: 'uppercase',
  },
  title: {
    color: colors.foreground,
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 44,
    marginBottom: designSpacing[3],
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 17,
    lineHeight: 24,
  },
  panel: {
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: designRadii.md,
    borderWidth: 1,
    marginBottom: designSpacing[4],
    padding: designSpacing[5],
  },
  panelAccent: {
    backgroundColor: colors.ring,
    height: 4,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  panelLabel: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: designSpacing[2],
    textTransform: 'uppercase',
  },
  panelValue: {
    color: colors.cardForeground,
    fontSize: 22,
    fontWeight: '800',
  },
  grid: {
    marginBottom: designSpacing[5],
  },
  card: {
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: designRadii.md,
    borderWidth: 1,
    marginBottom: designSpacing[3],
    padding: designSpacing[4],
  },
  cardAccent: {
    backgroundColor: '#f59e0b',
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 4,
  },
  cardLabel: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: designSpacing[2],
    textTransform: 'uppercase',
  },
  cardValue: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: designSpacing[2],
  },
  cardDetail: {
    color: colors.mutedForeground,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderColor: colors.border,
    borderRadius: designRadii.sm,
    borderWidth: 1,
    color: colors.foreground,
    marginVertical: designSpacing[3],
    minHeight: 44,
    padding: designSpacing[3],
  },
  inputLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700',
  },
  farmerButton: {
    borderColor: colors.border,
    borderRadius: designRadii.sm,
    borderWidth: 1,
    marginVertical: designSpacing[1],
    paddingHorizontal: designSpacing[3],
  },
  farmerButtonSelected: {
    borderColor: colors.ring,
    borderWidth: 2,
  },
  actionButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.ring,
    borderRadius: designRadii.sm,
    paddingHorizontal: designSpacing[4],
    paddingVertical: designSpacing[3],
  },
  actionButtonText: {
    color: colors.primaryForeground,
    fontWeight: '700',
  },
  workItem: {
    color: colors.foreground,
    flex: 1,
    marginVertical: designSpacing[2],
  },
  workItemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: designSpacing[2],
  },
  notice: {
    color: colors.foreground,
    fontWeight: '700',
    marginBottom: designSpacing[5],
  },
});
