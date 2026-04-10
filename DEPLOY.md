# Deployment Guide

## ⚠️ FIRST: Rotate your leaked Supabase keys

You shared `service_role` and `sb_secret` keys in chat. They have full admin
access. **Rotate them now** in Supabase Settings → API → "Reset secret keys".
The anon key in `.env.local` is fine to keep — it's designed to be public.

---

## Step 1: Create the database tables

1. Open https://supabase.com/dashboard/project/afrblreobruaguxqtavd
2. Click **SQL Editor** in the left sidebar
3. Click **+ New query**
4. Open `supabase-schema.sql` from this folder, copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** (or press Ctrl+Enter)
7. You should see "Success. No rows returned"

To verify, go to **Table Editor** in the sidebar — you should see 3 new tables:
- `rooms`
- `players`
- `player_actions`

---

## Step 2: Push to GitHub

You have two options:

### Option A: Create the repo on GitHub.com manually
1. Go to https://github.com/new
2. Repository name: `matijamon-bachelor-web`
3. Make it **Private** (or public, your call)
4. Don't initialize with README/license/gitignore (we already have files)
5. Click **Create repository**
6. Copy the URL it shows you (e.g. `https://github.com/YOUR_USERNAME/matijamon-bachelor-web.git`)
7. From this folder, run:
   ```
   cd /mnt/d/matijamon-bachelor-web
   git remote add origin https://github.com/YOUR_USERNAME/matijamon-bachelor-web.git
   git push -u origin main
   ```

### Option B: GitHub CLI (if installed)
```
gh repo create matijamon-bachelor-web --private --source=. --remote=origin --push
```

---

## Step 3: Deploy to Vercel

1. Go to https://vercel.com/new
2. Click **Import Git Repository** → pick `matijamon-bachelor-web`
3. Vercel will auto-detect it's a Next.js project
4. **IMPORTANT**: Before clicking Deploy, expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://afrblreobruaguxqtavd.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (the anon key from .env.local)
5. Project name: pick something like `matijamon-bachelor` (this becomes the URL)
6. Click **Deploy**
7. Wait ~2-3 minutes (the music files take a bit to upload)
8. You'll get a URL like `https://matijamon-bachelor.vercel.app`

---

## Step 4: Test it

### On your TV
1. Open the smart TV browser
2. Type `https://matijamon-bachelor.vercel.app` (or whatever your URL is)
3. Click "POKRENI IGRU"
4. You should see a QR code + room code (4 letters)

### On your phone
1. Scan the QR code OR type the same URL and click "PRIDRUZI SE"
2. Enter the room code
3. Type your name → pick your character
4. You'll see "Cekam pocetak igre..." (waiting)

### On the TV again
- Players appear in the lobby
- Once 2+ players are joined, click "POKRENI IGRU"
- The game begins, cards appear, players vote from their phones

---

## What's working in v1

- ✅ Lobby with QR code joining
- ✅ Character selection from phone (15 fighters)
- ✅ Card drawing (all 13 types)
- ✅ Truth/Dare with "did it" vs "chickened" buttons
- ✅ Most Likely To with phone voting + tally
- ✅ WYR / Hot Take with binary voting
- ✅ Who In The Room with picker
- ✅ Music playback (random tracks per round)
- ✅ Drink tracking per player on phones
- ✅ End-of-night scoreboard
- ✅ Real-time sync via Supabase
- ✅ Mobile-first responsive design
- ✅ Pixel art aesthetic (PressStart2P font)

## What needs polish for v2 (after first test)

- Boss fight visual sequence (currently just shows the card)
- Animated card flip
- Drink splash animation
- Awards page
- Music widget with controls (currently just plays automatically)
- Sound effects on actions

---

## Troubleshooting

**"Soba ne postoji" when joining**
- The room expired (not implemented yet) or the URL has the wrong code
- Make sure you're using the same Supabase project on host and player

**Music doesn't play**
- Browsers require a user click before audio plays
- Click the "POKRENI IGRU" button on the host screen — that triggers audio start

**Phone says "Soba ne postoji" but I just created it**
- Check your Supabase tables exist (Step 1)
- Check Vercel env vars are set correctly (Step 3 → Project Settings → Environment Variables)
- Look at browser console for errors

**Build fails on Vercel**
- Most common: env vars not set. Re-check step 3.
- If it complains about something else, copy the error and we'll fix it
