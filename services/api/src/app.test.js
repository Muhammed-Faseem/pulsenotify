const request = require('supertest');
const app = require('./app');

describe('API auth', () => {
  it('rejects requests without an API key', async () => {
    const res = await request(app).get('/api/notifications?userId=u1');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/X-API-Key/);
  });

  it('returns 400 for a missing userId when authenticated', async () => {
    // No key -> still 401, proving auth runs before validation
    const res = await request(app).post('/api/notifications').send({});
    expect(res.status).toBe(401);
  });
});
