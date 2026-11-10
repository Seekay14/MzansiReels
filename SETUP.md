# MzansiReels upgrade: setup

## 1. Install (Expo SDK 58)
```bash
npx expo uninstall expo-av        # removed from the SDK; replaced by expo-video
npx expo install expo-video
npx expo install --fix            # aligns every package with SDK 58
npx expo-doctor
npx expo lint
```
`expo-av` has been removed in favor of `expo-video`. Native uploads can generate a video
thumbnail with `expo-video-thumbnails`, and creators can choose a custom cover image.
If a web upload has no selected cover, it is saved without a thumbnail rather than
displaying placeholder artwork.
Because `expo-video` and the image picker plugin changed, build a development build
(`npx expo run:android` / `run:ios`) if Expo Go complains.

## 2. Appwrite: two new collections
Create both in database `6af0bc84001abbbcb856`, then paste their IDs into `config/constants.js`.

| Collection | Attributes (all required strings) |
|---|---|
| likes   | `videoId` (36), `userId` (36) |
| follows | `followerId` (36), `followingId` (36) |

Add an index on each collection for the fields you query (likes: `videoId`, `userId`; follows: `followerId`, `followingId`).

Permissions: for every collection the app writes to (videos, comments, users, messages,
notifications, likes, follows), give role **Users** Create, Read, Update and Delete while
developing. Tighten later with document-level security.
Bucket `6af0bf150026128b0048`: Users create/delete, Any read (video and avatar URLs are public views).

Existing collections need **no** new attributes.

## 3. Appwrite platform
`config/appwrite.js` still uses `setPlatform('127.0.0.1')`. In the Appwrite console, add a
platform whose ID matches what you set. For devices that is your bundle id / package name
(`com.yourname.mzansireels`, change it in app.json too) and `host.exp.exponent` for Expo Go.

## Project layout
Drop these files into your project (they replace the old ones). `App.js`, `index.js`,
`app.json`, `config/`, `context/`, `components/`, `screens/`.
Navigation stays on React Navigation. Your AGENTS.md prefers Expo Router; say so if you want that migration.
