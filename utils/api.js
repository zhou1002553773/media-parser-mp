import { request } from './request';

function createRequestId(prefix = 'req') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getMe() {
  return request('/api/v1/users/me');
}

function getBenefit() {
  return request('/api/v1/users/me/benefit');
}

function grantAdReward(verificationData = null) {
  return request('/api/v1/users/me/ad-reward', {
    method: 'POST',
    data: {
      request_id: createRequestId('ad'),
      verification_data: verificationData
    }
  });
}

function createParse(url, requestId = createRequestId('parse')) {
  return request('/api/v1/parses', {
    method: 'POST',
    data: {
      request_id: requestId,
      url
    }
  });
}

function listParses(page = 1, pageSize = 20) {
  return request('/api/v1/parses', {
    data: {
      page,
      page_size: pageSize
    }
  });
}

function getParse(id) {
  return request(`/api/v1/parses/${id}`);
}

function retryParse(id) {
  return request(`/api/v1/parses/${id}/retry`, { method: 'POST' });
}

function deleteParse(id) {
  return request(`/api/v1/parses/${id}`, { method: 'DELETE' });
}

export {
  createRequestId,
  getMe,
  getBenefit,
  grantAdReward,
  createParse,
  listParses,
  getParse,
  retryParse,
  deleteParse
};
