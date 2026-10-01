const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const env = require('../src/config/env');
const { Analysis } = require('../src/models');
const { createApp, auth, registerUser, createGuest, createAdmin, recognize, makeImage } = require('./helpers');

const app = createApp();

describe('Private photos of recognitions', () => {
  let owner;
  let stranger;
  let admin;
  let file;
  let analysisId;

  const photo = (token, id = analysisId) => request(app).get(`/analysis/${id}/image`).set(auth(token));
  const storedName = async (id) => (await Analysis.findByPk(id)).image_file;
  const storedPath = async (id) => path.join(env.UPLOAD_DIR, path.basename(await storedName(id)));
  const newRecognition = async (token, size) => (await recognize(app, token, makeImage(size)).expect(200)).body.data.analysis_id;

  beforeAll(async () => {
    owner = await registerUser(app);
    stranger = await registerUser(app);
    admin = await createAdmin();
    file = makeImage(640);
    analysisId = (await recognize(app, owner.token, file).expect(200)).body.data.analysis_id;
  });

  describe('GET /analysis/:id/image', () => {
    test('the owner receives the photo, never sniffed and cached only privately', async () => {
      const res = await photo(owner.token).expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private, max-age=86400');
      expect(Buffer.compare(res.body, fs.readFileSync(file))).toBe(0);
    });

    test('administrators can review any photo', async () => {
      const res = await photo(admin.token).expect(200);
      expect(Buffer.compare(res.body, fs.readFileSync(file))).toBe(0);
    });

    test('nobody else can: anonymous requests get 401 and other users 403', async () => {
      await request(app).get(`/analysis/${analysisId}/image`).expect(401);
      await photo('not-a-token').expect(401);

      const forbidden = await photo(stranger.token).expect(403);
      expect(forbidden.body.errorCode).toBe('403_FORBIDDEN');
      await photo((await createGuest(app)).token).expect(403);
    });

    test('a guest session can see its own photos', async () => {
      const guest = await createGuest(app);
      const id = await newRecognition(guest.token, 641);

      await photo(guest.token, id).expect(200);
    });

    test('an unknown recognition answers 404', async () => {
      const res = await photo(owner.token, 'no-such-analysis').expect(404);
      expect(res.body.errorCode).toBe('404_NOT_FOUND');
    });

    test('conditional and range requests keep the private headers', async () => {
      const first = await photo(owner.token).expect(200);
      const again = await photo(owner.token).set('If-None-Match', first.headers.etag).expect(304);
      expect(again.headers['cache-control']).toBe('private, max-age=86400');

      const part = await photo(owner.token).set('Range', 'bytes=0-9').expect(206);
      expect(part.headers['x-content-type-options']).toBe('nosniff');
      expect(part.body).toHaveLength(10);
    });

    describe('when the photo cannot be sent', () => {
      const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;

      const expectCleanJson = (res) => {
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.headers['cache-control'] || '').not.toMatch(/max-age/); // an error is never cached as if it were the photo
        expect(JSON.stringify(res.body)).not.toContain(env.UPLOAD_DIR);
        expect(JSON.stringify(res.body)).not.toMatch(/ENOENT|EACCES/);
      };

      test('a photo that is gone from disk answers 404 without revealing where files are kept', async () => {
        const id = await newRecognition(owner.token, 642);
        fs.rmSync(await storedPath(id));

        const res = await photo(owner.token, id).expect(404);

        expect(res.body.message).toMatch(/no longer available/);
        expectCleanJson(res);
      });

      (asRoot ? test.skip : test)('a photo that exists but cannot be read is a server error, not a mislabelled answer', async () => {
        const id = await newRecognition(owner.token, 644);
        const unreadable = await storedPath(id);
        fs.chmodSync(unreadable, 0o000);

        try {
          const res = await photo(owner.token, id).expect(500);
          expect(res.body.errorCode).toBe('500_INTERNAL_SERVER_ERROR');
          expectCleanJson(res);
        } finally {
          fs.chmodSync(unreadable, 0o644);
        }
      });

      test('an empty, hidden or directory reference answers 404', async () => {
        const id = await newRecognition(owner.token, 645);
        fs.writeFileSync(path.join(env.UPLOAD_DIR, '.hidden'), 'not a photo');
        fs.mkdirSync(path.join(env.UPLOAD_DIR, 'folder'), { recursive: true });

        for (const reference of ['', '.hidden', '..', '.', 'folder', '/uploads/analyses/folder']) {
          await Analysis.update({ image_file: reference }, { where: { id } });
          const res = await photo(owner.token, id);
          expect([reference, res.status]).toEqual([reference, 404]);
        }
      });

      test('a stored reference cannot lead outside the uploads folder', async () => {
        const outside = path.join(path.dirname(env.UPLOAD_DIR), 'secret.txt');
        fs.writeFileSync(outside, 'top secret');
        const id = await newRecognition(owner.token, 643);

        for (const reference of ['../secret.txt', '/uploads/analyses/../../secret.txt', '..%2fsecret.txt', 'C:\\secret.txt']) {
          await Analysis.update({ image_file: reference }, { where: { id } });
          const res = await photo(owner.token, id);
          expect([reference, res.status]).toEqual([reference, 404]);
          expect(res.text || '').not.toContain('top secret');
        }
      });
    });
  });

  describe('what is stored and what is shown', () => {
    const protectedPath = () => `/analysis/${analysisId}/image`;

    test('new recognitions store the bare file name', async () => {
      const stored = await storedName(analysisId);
      expect(stored).toMatch(/^[0-9a-f-]+\.jpg$/);
      expect(fs.existsSync(await storedPath(analysisId))).toBe(true);
    });

    test('rows saved with the former public path keep working', async () => {
      const id = await newRecognition(owner.token, 646);
      await Analysis.update({ image_file: `/uploads/analyses/${await storedName(id)}` }, { where: { id } });

      await photo(owner.token, id).expect(200);
    });

    test('the address of the photo is the protected endpoint, never a public file', async () => {
      const detail = await request(app).get(`/analysis/${analysisId}`).set(auth(owner.token)).expect(200);
      expect(detail.body.data.image_url).toBe(protectedPath());

      const history = await request(app).get('/analysis').set(auth(owner.token)).expect(200);
      expect(history.body.data.analyses.find((item) => item.id === analysisId).image_url).toBe(protectedPath());

      const specimenId = detail.body.data.primary_specimen_id;
      const discovery = await request(app).get(`/collection/${specimenId}`).set(auth(owner.token)).expect(200);
      expect(discovery.body.data.recognitions.find((item) => item.id === analysisId).image_url).toBe(protectedPath());

      const adminHistory = await request(app).get('/admin/history?limit=100').set(auth(admin.token)).expect(200);
      expect(JSON.stringify(adminHistory.body)).toContain(protectedPath());

      const adminFeedback = await request(app).get('/admin/feedback').set(auth(admin.token)).expect(200);
      expect(adminFeedback.status).toBe(200);

      for (const body of [detail.body, history.body, discovery.body, adminHistory.body, adminFeedback.body]) {
        expect(JSON.stringify(body)).not.toContain('/uploads/analyses');
      }
    });

    test('the stored file name is internal: no response carries it', async () => {
      const stored = await storedName(analysisId);
      const responses = [
        await request(app).get(`/analysis/${analysisId}`).set(auth(owner.token)).expect(200),
        await request(app).get('/analysis').set(auth(owner.token)).expect(200),
        await request(app).get('/admin/history?limit=100').set(auth(admin.token)).expect(200)
      ];

      for (const res of responses) {
        expect(JSON.stringify(res.body)).not.toContain('image_file');
        expect(JSON.stringify(res.body)).not.toContain(stored);
      }
    });

    test('asking only for image_url still gives a working address', async () => {
      const row = await Analysis.findOne({ where: { id: analysisId }, attributes: ['image_url'] });
      expect(row.image_url).toBe(protectedPath());
    });
  });

  describe('static files', () => {
    test('only the catalog pictures are mounted: the photos have no public address', () => {
      const mounted = jest.spyOn(express, 'static');
      try {
        createApp();
        expect(mounted.mock.calls.map(([root]) => root)).toEqual([path.resolve(env.SPECIMEN_UPLOAD_DIR)]);
      } finally {
        mounted.mockRestore();
      }
    });

    test('the old public address answers 404, with or without a token', async () => {
      const name = path.basename(await storedName(analysisId));
      expect(fs.existsSync(path.join(env.UPLOAD_DIR, name))).toBe(true);

      await request(app).get(`/uploads/analyses/${name}`).expect(404);
      await request(app).get(`/uploads/analyses/${name}`).set(auth(owner.token)).expect(404);
      await request(app).get(`/uploads/${name}`).expect(404);
    });

    test('catalog pictures stay public', async () => {
      fs.writeFileSync(path.join(env.SPECIMEN_UPLOAD_DIR, 'public_picture.png'), Buffer.from('not really a png'));

      await request(app).get('/uploads/specimens/public_picture.png').expect(200);
    });
  });
});
