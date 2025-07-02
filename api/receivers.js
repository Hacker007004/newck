export default async function handler(req, res) {
  const receivers = Object.keys(process.env)
    .filter(key => key.startsWith('APP_PASS_'))
    .map(key => key.replace(/^APP_PASS_/, '').replace(/_/g, '.'));

  res.status(200).json({ receivers });
}
