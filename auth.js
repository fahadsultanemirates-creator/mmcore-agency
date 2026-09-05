// M&MCore Agency — Authentication logic

// -------- Password visibility toggle (login.html, signup.html) --------
document.querySelectorAll('.password-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.classList.toggle('is-showing', !showing);
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
});

function showAuthError(el, message) {
  el.textContent = message;
  el.style.display = 'block';
}

function hideAuthError(el) {
  el.style.display = 'none';
}

function setLoading(btn, loading, defaultText) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : defaultText;
}

// -------- SIGN UP --------
const signupForm = document.getElementById('signupForm');
const referralCodeInput = document.getElementById('referralCode');
if (referralCodeInput) {
  const refFromLink = new URLSearchParams(window.location.search).get('ref');
  if (refFromLink) referralCodeInput.value = refFromLink;
}
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('authError');
    const btn = document.getElementById('signupBtn');
    hideAuthError(errorEl);

    const name = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const referralCode = referralCodeInput.value.trim().toUpperCase() || null;

    if (password.length < 8) {
      showAuthError(errorEl, 'Password must be at least 8 characters.');
      return;
    }

    setLoading(btn, true, 'Create account');

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          referred_by: referralCode
        }
      }
    });

    setLoading(btn, false, 'Create account');

    if (error) {
      showAuthError(errorEl, error.message);
      return;
    }

    if (data.user && !data.session) {
      // Email confirmation required
      window.location.href = 'check-email.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  });
}

// -------- LOG IN --------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('authError');
    const btn = document.getElementById('loginBtn');
    hideAuthError(errorEl);

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    setLoading(btn, true, 'Log in');

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    setLoading(btn, false, 'Log in');

    if (error) {
      showAuthError(errorEl, 'Incorrect email or password.');
      return;
    }

    window.location.href = 'dashboard.html';
  });
}

// -------- FORGOT PASSWORD: request reset email --------
const resetRequestForm = document.getElementById('resetRequestForm');
if (resetRequestForm) {
  resetRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('authError');
    const successEl = document.getElementById('authSuccess');
    const btn = document.getElementById('resetRequestBtn');
    hideAuthError(errorEl);
    successEl.style.display = 'none';

    const email = document.getElementById('email').value.trim();
    setLoading(btn, true, 'Send reset link');

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname.replace('reset-request.html', '')}reset-password.html`
    });

    setLoading(btn, false, 'Send reset link');

    if (error) {
      showAuthError(errorEl, error.message);
      return;
    }

    resetRequestForm.reset();
    // Deliberately generic -- don't reveal whether the email is registered.
    successEl.textContent = 'If an account exists for that email, a reset link is on its way.';
    successEl.style.display = 'block';
  });
}

// -------- FORGOT PASSWORD: set new password (from the emailed reset link) --------
const setNewPasswordForm = document.getElementById('setNewPasswordForm');
if (setNewPasswordForm) {
  setNewPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('authError');
    const btn = document.getElementById('setNewPasswordBtn');
    hideAuthError(errorEl);

    const password = document.getElementById('password').value;
    if (password.length < 8) {
      showAuthError(errorEl, 'Password must be at least 8 characters.');
      return;
    }

    setLoading(btn, true, 'Set new password');
    const { error } = await supabaseClient.auth.updateUser({ password });
    setLoading(btn, false, 'Set new password');

    if (error) {
      showAuthError(errorEl, error.message);
      return;
    }

    window.location.href = 'dashboard.html';
  });
}

// -------- LOG OUT (used on dashboard pages) --------
async function logOut() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

// -------- ROUTE PROTECTION (used on dashboard pages) --------
async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}
