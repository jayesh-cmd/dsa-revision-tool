require('dotenv').config();
// cron/send-reminders.js
// Runs daily via GitHub Actions at 8am IST
// Fetches due revisions per user, picks max 5, sends clean Telegram message

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const today = new Date().toISOString().split('T')[0];
const MAX_QUESTIONS = 5;

async function main() {
  console.log(`[${today}] Starting daily reminder job...`);

  const { data: users, error } = await supabase.from('users').select('*');
  if (error) { console.error('Failed to fetch users:', error); return; }

  console.log(`Sending reminders to ${users.length} user(s)...`);

  for (const user of users) {
    await sendReminderToUser(user);
  }

  console.log('Done!');
}

async function sendReminderToUser(user) {
  // Fetch today's due revisions, max 5
  const { data: revisions, error } = await supabase
    .from('revisions')
    .select(`
      revision_day,
      solved_questions (
        question_title, question_url, difficulty, topic
      )
    `)
    .eq('user_id', user.id)
    .eq('due_date', today)
    .order('revision_day')
    .limit(MAX_QUESTIONS);

  if (error) { console.error(`Error for user ${user.id}:`, error); return; }
  if (!revisions || revisions.length === 0) {
    console.log(`No revisions due today for ${user.telegram_username || user.telegram_chat_id}`);
    return;
  }

  // Build clean message
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  let msg = `📚 <b>DSA Revision — ${dateStr}</b>\n\n`;

  revisions.forEach((r, i) => {
    const q = r.solved_questions;
    const link = q.question_url
      ? `<a href="${q.question_url}">${q.question_title}</a>`
      : q.question_title;
    msg += `${i + 1}. ${link} — ${q.difficulty} [Day ${r.revision_day}]\n`;
  });

  // Send
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.telegram_chat_id,
          text: msg,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );

    const data = await res.json();
    if (data.ok) {
      console.log(`Sent to ${user.telegram_username || user.telegram_chat_id} (${revisions.length} questions)`);
    } else {
      console.error(`Failed to send to ${user.telegram_chat_id}:`, data);
    }
  } catch (err) {
    console.error(`Telegram error for ${user.telegram_chat_id}:`, err);
  }
}

main().catch(console.error);