import { request, getSession, saveSession, clearSession } from './request';

let loginPromise = null;

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject
    });
  });
}

async function login() {
  if (loginPromise) return loginPromise;

  loginPromise = wxLogin()
    .then((loginResult) => {
      if (!loginResult.code) {
        throw new Error('微信登录失败，请稍后重试');
      }
      return request('/api/v1/auth/wechat-login', {
        method: 'POST',
        auth: false,
        data: { code: loginResult.code }
      });
    })
    .then(response => saveSession(response.data))
    .finally(() => {
      loginPromise = null;
    });

  return loginPromise;
}

async function ensureLogin() {
  const session = getSession();
  if (session && session.session_token) return session;
  return login();
}

async function logout() {
  try {
    await request('/api/v1/auth/logout', { method: 'POST', retryAuth: false });
  } finally {
    clearSession();
  }
}

export { login, ensureLogin, logout };
