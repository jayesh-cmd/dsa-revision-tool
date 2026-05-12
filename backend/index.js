require('dotenv').config();
// backend/index.js

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// CORS for browser extension
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Link-Code');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Verify link code from extension
async function verifyLinkCode(req, res, next) {
  const linkCode = req.headers['x-link-code'];
  if (!linkCode) return res.status(401).json({ error: 'Missing link code' });

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('link_code', linkCode)
    .eq('link_code_used', true)
    .single();

  if (error || !user) return res.status(401).json({ error: 'Invalid or unused link code' });

  req.user = user;
  next();
}

// ─── EXTENSION: Log a solved question ─────────────────────────────────────────
app.post('/api/solved', verifyLinkCode, async (req, res) => {
  const { question_title, question_slug, question_url, difficulty, topic } = req.body;

  if (!question_title) {
    return res.status(400).json({ error: 'question_title is required' });
  }

  // Avoid duplicate logs for same question on same day
  const { data: existing } = await supabase
    .from('solved_questions')
    .select('id')
    .eq('user_id', req.user.id)
    .eq('question_slug', question_slug)
    .eq('solved_at', new Date().toISOString().split('T')[0])
    .single();

  if (existing) {
    return res.json({ message: 'Already logged today', duplicate: true });
  }

  const { data, error } = await supabase
    .from('solved_questions')
    .insert({
      user_id: req.user.id,
      question_title,
      question_slug,
      question_url,
      difficulty,
      topic,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true, question: data });
});

// ─── EXTENSION: Activate link code ────────────────────────────────────────────
app.post('/api/activate', async (req, res) => {
  const { link_code } = req.body;
  if (!link_code) return res.status(400).json({ error: 'link_code required' });

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('link_code', link_code.toUpperCase())
    .single();

  if (error || !user) return res.status(404).json({ error: 'Invalid link code' });
  if (user.link_code_used) return res.json({ success: true, already_activated: true });

  await supabase
    .from('users')
    .update({ link_code_used: true })
    .eq('id', user.id);

  res.json({ success: true, message: 'Extension linked successfully!' });
});

// ─── TELEGRAM WEBHOOK ─────────────────────────────────────────────────────────
app.post('/api/telegram-webhook', async (req, res) => {
  const message = req.body.message;
  if (!message) return res.sendStatus(200);

  const chatId = message.chat.id.toString();
  const text = (message.text || '').trim().toLowerCase();

  if (text === '/start') {
    await handleStart(chatId, message.from);
  }

  res.sendStatus(200);
});

async function sendTelegram(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function handleStart(chatId, from) {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .single();

  if (existing) {
    await sendTelegram(chatId,
      `👋 Welcome back!\n\nYour link code is: <code>${existing.link_code}</code>\n\nPaste this in the browser extension to connect.`
    );
    return;
  }

  const linkCode = 'DSA-' + Math.floor(1000 + Math.random() * 9000);

  await supabase.from('users').insert({
    telegram_chat_id: chatId,
    telegram_username: from.username || '',
    link_code: linkCode,
    link_code_used: false,
  });

  await sendTelegram(chatId,
    `👋 Welcome to DSA Revision Tracker!\n\n` +
    `Your link code is: <code>${linkCode}</code>\n\n` +
    `Paste this in the browser extension to connect.\n\n` +
    `Once connected, every question you solve on LeetCode will be automatically tracked and I'll remind you to revise on Day 1, 3, and 7!`
  );
}

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));