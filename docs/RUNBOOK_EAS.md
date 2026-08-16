# EAS builds — the parts that need your hands

Everything here needs your Expo credentials, so it is yours to run. Nothing in this file
has been executed; it is written from the EAS docs and the config already in the repo.

`apps/mobile/eas.json` is already configured with three profiles. `expo-dev-client` is in
`development` only — it must never reach the production profile.

---

## One-time setup

```bash
npm install -g eas-cli
```

```bash
eas login
```

Then, from the repo root:

```bash
cd apps/mobile && eas init
```

`eas init` creates the project on Expo's servers and writes `extra.eas.projectId` into
`app.json`. **Commit that change** — without it, CI and other machines cannot build.

---

## A development build on your own iPhone

This is the one worth doing first. It replaces the simulator build with something you can
carry around, which is the point of the whole exercise.

```bash
cd apps/mobile && eas build --profile development --platform ios
```

What to expect:

- **First run asks about credentials.** Let EAS manage them — it will create a distribution
  certificate and a provisioning profile for you. You need a free Apple ID; you do **not**
  need the $99 Apple Developer Program for a development build on your own device.
- **It will ask to register your device.** Say yes; it prints a URL / QR code. Open it on
  the iPhone and install the profile. This is why the free tier works: ad-hoc distribution
  to registered devices.
- **Build takes roughly 10–20 minutes** in the queue on the free tier.
- **It uses one of your 15 free iOS builds per month.**

When it finishes, scan the QR to install. Then, on your Mac:

```bash
cd apps/mobile && pnpm start
```

Scan the dev-server QR from inside the installed app. From then on, JavaScript changes
reload instantly — you only rebuild when a **native** dependency changes.

---

## When you must rebuild natively

Adding any package with native code. So far that has meant `@op-engineering/op-sqlite`,
`react-native-svg`, `expo-font` and `expo-dev-client`. Coming up: Skia (S9), Victory Native
(S9), speech recognition (S23) and camera (S23).

A JavaScript-only change never needs a rebuild.

---

## Registering a second device later

```bash
cd apps/mobile && eas device:create
```

Then rebuild, because the provisioning profile has to include the new device.

---

## What is deliberately not set up

- **Production / TestFlight.** That is the Session 19 ship-gate decision and costs $99/yr.
  The `production` profile exists in `eas.json` but has never been run.
- **Android.** Dropped from scope — iOS and web only.
- **EAS Update (OTA).** Not needed until there is someone other than you running the app.

---

## If it fails

- `eas build` failing on credentials → `eas credentials` to inspect and reset them.
- Build succeeds, app crashes on launch → check `eas build:view` logs, then confirm every
  native dependency is in `package.json` rather than only linked locally.
- App installs but shows a blank screen → the dev client cannot reach Metro. Both devices
  must be on the same network; `pnpm start --tunnel` works around a hostile one.
