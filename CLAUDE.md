# Stack Tracker Pro - Claude Code Instructions

## Project Overview
Stack Tracker Pro is a privacy-first iOS app for tracking precious metals portfolios (gold, silver, platinum, palladium). Built with React Native/Expo, Node.js backend on Railway, RevenueCat for subscriptions.

## CRITICAL: Build Workflow (READ FIRST!)

### DO NOT waste EAS builds on iterative testing!
- EAS free tier: 15 iOS builds/month
- Each build takes 15-30+ minutes
- Free tier has slow queue times

### Correct Workflow:
1. **Development/Testing**: Use the DEV BUILD with hot reload
   - `eas build --profile development --platform ios` (only need to do this once, or when native config changes)
   - JavaScript changes reload instantly - NO BUILD NEEDED
   
2. **Production/TestFlight**: Only when READY TO SHIP
   - `eas build --profile production --platform ios --auto-submit`
   - Use sparingly!

### When you DO need a new build:
- Changed app.json (native config)
- Added new native packages
- Changed iOS entitlements/capabilities
- Ready to submit to TestFlight/App Store

### When you DON'T need a new build:
- JavaScript/React code changes
- Bug fixes in App.js
- UI changes
- Backend changes (backend deploys to Railway separately)

## Tech Stack

### Mobile App
- **Framework**: React Native with Expo (SDK 52)
- **Location**: `/mobile-app`
- **Main file**: `App.js` (monolithic, ~2500+ lines)
- **State**: React useState + AsyncStorage for persistence
- **Subscriptions**: RevenueCat

### Backend
- **Framework**: Node.js/Express
- **Location**: `/backend`
- **Hosted**: Railway (auto-deploys from GitHub main branch)
- **URL**: stack-tracker-pro-production.up.railway.app

### Key Services
- **RevenueCat**: Subscription management (Gold Monthly $4.99, Yearly $39.99, Lifetime $79.99)
- **MetalPriceAPI**: Live spot prices (primary)
- **GoldAPI**: Fallback for spot prices
- **Claude Vision API**: Receipt OCR scanning

## App Features

### Free Tier
- 5 receipt scans/month (server-side tracking)
- Basic dashboard
- Manual holdings entry
- CSV export
- Manual cloud backup (file-based)

### Gold/Lifetime Tier
- Unlimited receipt scans
- iCloud sync across devices
- All free features

## Important Files

```
mobile-app/
├── App.js              # Main app (all screens, logic)
├── app.json            # Expo config, native settings
├── eas.json            # EAS build profiles
├── src/
│   └── components/
│       └── GoldPaywall.js  # Subscription paywall
└── assets/             # Icons, images

backend/
├── server.js           # Express API server
├── package.json
└── data/              # Historical price cache
```

## Known Issues & Quirks

### Receipt OCR
- Claude Vision sometimes misreads digits (8→3, 7→2)
- Price validation compares against live spot prices
- Still not 100% accurate - users should verify prices

### Spot Prices
- Silver is in a historic bull run (~$70-80/oz as of Jan 2026)
- Don't hardcode spot prices - always use live cache
- Gold is ~$4500/oz

### Data Persistence
- Bug was fixed where data wiped on app restart (race condition with AsyncStorage)
- `dataLoaded` flag prevents saving empty arrays before load completes

## Apple Developer Setup

### App ID: com.stacktrackerpro.app
### Team ID: 3BKELS5FG9

### Capabilities Enabled:
- In-App Purchase
- iCloud (CloudKit)
  - Container: iCloud.com.stacktrackerpro.app

## RevenueCat Setup

### Products:
- `stacktracker_gold_monthly` - $4.99/month
- `stacktracker_gold_yearly` - $39.99/year  
- `stacktracker_lifetime` - $79.99 one-time

### Entitlements:
- `Gold` - Monthly/Yearly subscribers
- `Lifetime` - Lifetime purchase

### Testing:
- Grant promotional entitlements via RevenueCat dashboard
- Customers → Search by $RCAnonymousID → Grant Promotional

## Deployment Checklist

### Backend Changes:
1. Edit files in `/backend`
2. `git add . && git commit -m "message" && git push`
3. Railway auto-deploys (2-3 minutes)
4. Check Railway logs for errors

### Mobile App (TestFlight):
1. Make sure all JS changes are tested in dev build first
2. Bump version in app.json if needed
3. `git add . && git commit -m "message" && git push`
4. `eas build --profile production --platform ios --auto-submit`
5. Wait for build + Apple processing (can take 1-2 hours total)
6. Test in TestFlight before App Store submission

### App Store Submission:
1. Go to App Store Connect
2. Create new version or select draft
3. Select build
4. Fill "What's New"
5. Submit for Review (24-48 hours typically)

## Common Commands

```bash
# Development
cd mobile-app
npx expo start                    # Start dev server (use with dev build)

# Building
eas build --profile development --platform ios    # Dev build (testing)
eas build --profile production --platform ios     # Production build

# Backend
cd backend
npm start                         # Local testing
git push origin main              # Deploy to Railway
```

## Monetization Strategy

Current Gold benefits:
1. Unlimited receipt scans
2. iCloud sync

Future features (see Future_Features.pdf):
- Price alerts
- iOS widgets
- Advanced analytics
- Multiple portfolios

## Contact & Support
- Support email: stacktrackerpro@gmail.com
- Users can find Support ID in Settings → Advanced
