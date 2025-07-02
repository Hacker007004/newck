import { simpleParser } from 'mailparser';
import imaps from 'imap-simple';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { sender, receivers } = req.body;

  const receiverAccounts = Object.fromEntries(
    Object.entries(process.env)
      .filter(([key]) => key.startsWith('APP_PASS_'))
      .map(([key, value]) => [
        key.replace(/^APP_PASS_/, '').replace(/_/g, '.'),
        value
      ])
  );

  const results = [];

  for (const email of receivers) {
    const password = receiverAccounts[email];
    if (!password) {
      results.push({ email, folder: 'not configured', subject: '-', time: '-' });
      continue;
    }

    const config = {
      imap: {
        user: email,
        password: password,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 10000
      }
    };

    try {
      const connection = await imaps.connect(config);
      await connection.openBox('INBOX');
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const searchCriteria = ['ALL', ['SINCE', since.toISOString()]];
      const fetchOptions = { bodies: ['HEADER'], markSeen: false };
      const messages = await connection.search(searchCriteria, fetchOptions);

      let found = false;

      for (const item of messages) {
        const all = item.parts.find(part => part.which === 'HEADER');
        const parsed = await simpleParser(all.body);
        if (parsed.from?.value?.[0]?.address === sender) {
          results.push({ email, folder: 'inbox', subject: parsed.subject || '-', time: parsed.date.toLocaleString() });
          found = true;
          break;
        }
      }

      if (!found) {
        await connection.openBox('[Gmail]/Spam');
        const spams = await connection.search(searchCriteria, fetchOptions);
        for (const item of spams) {
          const all = item.parts.find(part => part.which === 'HEADER');
          const parsed = await simpleParser(all.body);
          if (parsed.from?.value?.[0]?.address === sender) {
            results.push({ email, folder: 'spam', subject: parsed.subject || '-', time: parsed.date.toLocaleString() });
            found = true;
            break;
          }
        }
      }

      if (!found) results.push({ email, folder: 'not found', subject: '-', time: '-' });
      await connection.end();
    } catch (err) {
      results.push({ email, folder: 'error', subject: '-', time: '-' });
    }
  }

  res.status(200).json({ results });
}
