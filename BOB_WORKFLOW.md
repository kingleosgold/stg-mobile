# Bob's Stack Tracker Gold Workflow

## Git Branch Policy (MANDATORY)

**NEVER push directly to `main`**

### Before Making ANY Changes:
```bash
cd ~/clawd/stacktrackergold-mobile/mobile-app
git checkout -b bob/feature-name
```

### Branch Naming Convention:
- Feature: `bob/feature-name`
- Bug fix: `bob/fix-name`
- Examples:
  - `bob/receipt-scanner-improvements`
  - `bob/fix-price-alert-crash`
  - `bob/portfolio-analytics-ui`

### Standard Workflow:
```bash
# 1. Create branch
git checkout -b bob/my-feature

# 2. Make changes
# ... code, test, iterate ...

# 3. Commit
git add .
git commit -m "Clear description of changes"

# 4. Push to feature branch
git push origin bob/my-feature

# 5. Create PR on GitHub for review
# Jon reviews and merges to main
```

## Development Checklist

Before starting work:
- [ ] Pull latest from main: `git checkout main && git pull`
- [ ] Create feature branch: `git checkout -b bob/feature-name`
- [ ] Verify on correct branch: `git branch` (should show `*bob/feature-name`)

Before committing:
- [ ] Test changes locally
- [ ] Run `npx expo start` - verify no errors
- [ ] Check console for warnings
- [ ] Write clear commit message

Before pushing:
- [ ] Review changes: `git diff`
- [ ] Ensure no secrets/keys committed
- [ ] Push to feature branch (NOT main)

## Notes

- Main branch is protected - Jon reviews all PRs
- Keep branches focused (one feature/fix per branch)
- Delete branch after PR is merged
- Regular commits > one giant commit

---

**Remember:** This isn't my repo to cowboy around in. Ship features through PRs, get review, merge clean. 🛠️
