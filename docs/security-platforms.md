# Security Platform Comparison

## Feature matrix

| Feature            | GitHub            | GitLab                 |
| ------------------ | ----------------- | ---------------------- |
| PR/MR templates    | ✅                | ✅                     |
| Secret scanning    | ✅ Gitleaks       | ✅ Secret Detection    |
| Dependency updates | ✅ Dependabot     | ✅ Dependency Scanning |
| SAST               | Local native SAST | ✅ SAST                |
| Container scanning | Not automated     | ✅ Container Scanning  |
| CODEOWNERS         | ✅                | ✅                     |
| Branch protection  | ✅                | ✅                     |
| Scorecard          | Not automated     | ❌                     |

## Platform setup notes

### GitHub

- CODEOWNERS in .github/CODEOWNERS
- Dependabot in .github/dependabot.yml
- No repository-owned CodeQL, dependency-review, or Scorecard execution
- Security advisories via Settings → Security

### GitLab

- CODEOWNERS in .github/CODEOWNERS (works on GitLab too)
- CI/CD pipelines auto-included via template imports
- SAST/Secret Detection/Dependency Scanning via include:template
