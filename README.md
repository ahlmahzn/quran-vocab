# 🌙 Quran Vocabulary — Setup Guide

A shared vocabulary study app for your Quran group. Words added by anyone instantly appear for everyone.

---

## Step 1 — Set up Supabase (the database)

1. Go to [supabase.com](https://supabase.com) and create a **free account**
2. Click **"New Project"** — give it a name like `quran-vocab`, set a password, choose a region
3. Wait ~1 minute for it to spin up
4. Go to **SQL Editor** (left sidebar) and run this SQL to create the words table:

```sql
create table words (
  id uuid default gen_random_uuid() primary key,
  arabic text not null,
  meaning text not null,
  root text,
  added_by text,
  surah text,
  created_at timestamptz default now()
);

-- Allow anyone to read/write (no login required)
alter table words enable row level security;
create policy "Public read" on words for select using (true);
create policy "Public insert" on words for insert with check (true);
create policy "Public delete" on words for delete using (true);
```

5. Go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon / public** key

---

## Step 2 — Deploy to Vercel (the hosting)

1. Go to [github.com](https://github.com) and create a **free account** if you don't have one
2. Create a new repository called `quran-vocab` and upload all these project files
3. Go to [vercel.com](https://vercel.com) and sign in with GitHub
4. Click **"Add New Project"** → import your `quran-vocab` repo
5. Before clicking Deploy, expand **"Environment Variables"** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
6. Click **Deploy** 🚀

Vercel will give you a URL like `https://quran-vocab.vercel.app` — **share this link with your group!**

---

## Updating the app later

Any time you push changes to GitHub, Vercel auto-deploys them instantly.

---

## That's it!

- Words added by anyone appear in real time for everyone
- Quiz yourself any time with multiple-choice questions
- Filter the quiz by contributor to study specific members' words
- Free forever on both Supabase and Vercel free tiers
