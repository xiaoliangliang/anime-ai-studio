import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.2.0',
    endpoints: [
      'POST /api/chat',
      'POST /api/runcomfy/submit',
      'GET  /api/runcomfy/status',
      'GET  /api/txt2img',
      'GET  /api/img2img',
      'POST /api/imgbb/upload',
      'GET  /api/health',
    ],
  });
}
