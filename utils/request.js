import config from './config.js';

const SESSION_KEY = 'parse_session';
let refreshingPromise = null;

function getSession() {
  return wx.getStorageSync(SESSION_KEY) || null;
}

function saveSession(session) {
  wx.setStorageSync(SESSION_KEY, session);
  return session;
}

function clearSession() {
  wx.removeStorageSync(SESSION_KEY);
}

function createError(data, statusCode) {
  const message = data && (data.msg || data.message || data.retdesc) || `HTTP错误: ${statusCode}`;
  const error = new Error(message);
  error.code = data && data.code;
  error.response = data;
  error.statusCode = statusCode;
  return error;
}

function rawRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : `${config.baseURL}${url}`;
    const session = getSession();
    const header = {
      'content-type': 'application/json',
      ...(options.header || {})
    };

    if (options.auth !== false && session && session.session_token) {
      header.Authorization = `Bearer ${session.session_token}`;
    }

    wx.request({
      url: fullUrl,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: options.timeout || config.timeout,
      success(res) {
        const data = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300 && data && (data.code === 200 || data.retcode === 200)) {
          resolve(data);
          return;
        }
        reject(createError(data, res.statusCode));
      },
      fail(err) {
        reject(new Error(`请求失败: ${err.errMsg || '未知错误'}`));
      }
    });
  });
}

async function refreshSession() {
  if (refreshingPromise) return refreshingPromise;

  refreshingPromise = rawRequest('/api/v1/auth/refresh', {
    method: 'POST',
    retryAuth: false
  }).then(response => saveSession(response.data))
    .catch(error => {
      clearSession();
      throw error;
    })
    .finally(() => {
      refreshingPromise = null;
    });

  return refreshingPromise;
}

async function request(url, options = {}, retryCount = 0) {
  try {
    return await rawRequest(url, options);
  } catch (error) {
    if (options.auth !== false && options.retryAuth !== false && error.code === 40102) {
      await refreshSession();
      return rawRequest(url, { ...options, retryAuth: false });
    }

    if (!error.statusCode && retryCount < config.maxRetries) {
      return request(url, options, retryCount + 1);
    }
    throw error;
  }
}

export {
  request,
  config,
  getSession,
  saveSession,
  clearSession,
  refreshSession
};
