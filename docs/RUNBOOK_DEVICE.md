# Running RASEED on your own iPhone

Everything here needs the Mac, the cable and the phone in front of you. None of it needs a
paid Apple Developer account — a free Apple ID is enough to run the app on your own device.

---

## What a free Apple ID gets you, and what it costs

| | Free Apple ID | Paid account ($99/yr) |
|---|---|---|
| Run on your own iPhone | ✅ | ✅ |
| **App expires after** | **7 days** | 1 year |
| Devices | 3 | 100 |
| TestFlight / App Store | ❌ | ✅ |
| Push notifications | ❌ | ✅ |

The seven-day expiry is the only real friction: after a week the app refuses to launch and
you re-run one command. For daily personal use that is genuinely fine. Pay the $99 when you
want it on someone else's phone, or when notifications become part of the product.

---

## One-time setup

### 1. Enable Developer Mode on the iPhone

iOS 16 and later hide this until a development build has been attempted.

1. Plug the phone in, unlock it, and tap **Trust** on the prompt.
2. **Settings → Privacy & Security → Developer Mode → On.**
3. The phone restarts and asks you to confirm after unlocking.

If **Developer Mode** is not in that menu, it appears after the first `expo run:ios --device`
attempt. Run step 3 below once, then come back here.

### 2. Give Xcode your Apple ID

1. Open Xcode → **Settings → Accounts → +** → Apple ID → sign in.
2. Open the project:
   ```bash
   open apps/mobile/ios/RASEED.xcworkspace
   ```
   The **workspace**, not the `.xcodeproj` — CocoaPods builds will not link otherwise.
3. Select the **RASEED** target → **Signing & Capabilities**.
4. Tick **Automatically manage signing**, and pick your name under **Team**.

Xcode will report a bundle-identifier conflict if `com.krishnamathur.raseed` is already
registered to another Apple ID. **Do not change the bundle identifier** — `CLAUDE.md` locks
it, and changing it means a new app record, a new keychain, and a device database that no
longer matches. Append a suffix to a *separate* debug configuration instead if you ever hit
this.

---

## Every time

```bash
cd apps/mobile
npx expo run:ios --device
```

It lists connected devices; pick your iPhone. First build takes 5–15 minutes, later ones
under a minute.

The app then loads JavaScript from Metro on your Mac, so **both must stay on the same
Wi-Fi**. To use it away from the desk, build a version with the JS bundled in:

```bash
npx expo run:ios --device --configuration Release
```

Slower to build, but it runs standalone — no Mac, no Wi-Fi, no Metro. This is the one to use
if you actually want to carry it around for a week.

---

## When it goes wrong

**"Untrusted Developer" when tapping the icon**
Settings → General → VPN & Device Management → your Apple ID → **Trust**.

**"Unable to install" / signing errors**
Almost always no Team selected. Redo one-time step 2.4.

**Build fails at `pod install` with `Unicode Normalization not appropriate for ASCII-8BIT`**
A locale problem wearing a Unicode costume. Ruby 4.x with CocoaPods 1.17 needs:
```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
```

**"Skia prebuilt binaries not found"**
pnpm blocks lifecycle scripts by default. Already fixed in `pnpm-workspace.yaml` under
`onlyBuiltDependencies` — if you see it, run `pnpm install` from the repo root rather than
`npx install-skia`, so the fix persists for the next clone.

**App launches, then white screen**
Metro is not reachable. Same Wi-Fi, no VPN, and `npx expo start --dev-client` running. Or
build `--configuration Release` and stop depending on it.

**App stopped opening after a week**
The free-provisioning expiry. Re-run `npx expo run:ios --device`. Nothing is lost — the
SQLite database lives in the app container and survives reinstall over the same signature.

---

## Getting it onto someone else's phone

Needs the paid account. Then:

```bash
eas build --profile preview --platform ios
```

`eas.json` already has the profile. You will have to run `eas login` yourself — those are
your Apple credentials and I will not enter them. Steps are in
[RUNBOOK_EAS.md](RUNBOOK_EAS.md).
