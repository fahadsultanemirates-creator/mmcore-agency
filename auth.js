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

// Every entry point below needs the SDK. If the CDN bundle didn't load,
// requireSupabase() puts a visible message on the page and we stop here
// rather than throwing a null dereference into the console.
const SUPABASE_READY = requireSupabase();

// -------- SIGN UP --------
const signupForm = document.getElementById('signupForm');
const referralCodeInput = document.getElementById('referralCode');
if (referralCodeInput) {
  const refFromLink = new URLSearchParams(window.location.search).get('ref');
  if (refFromLink) referralCodeInput.value = refFromLink;
}
if (signupForm && SUPABASE_READY) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('authError');
    const btn = document.getElementById('signupBtn');
    hideAuthError(errorEl);

    const name = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('passwordConfirm').value;
    const acceptTerms = document.getElementById('acceptTerms');
    const referralCode = referralCodeInput.value.trim().toUpperCase() || null;

    if (password.length < 8) {
      showAuthError(errorEl, 'Password must be at least 8 characters.');
      return;
    }

    if (password !== passwordConfirm) {
      showAuthError(errorEl, 'The two passwords do not match.');
      return;
    }

    if (acceptTerms && !acceptTerms.checked) {
      showAuthError(errorEl, 'Please accept the Terms of Service and Privacy Policy to continue.');
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
if (loginForm && SUPABASE_READY) {
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
      // Collapsing every failure into "Incorrect email or password" is
      // right for a wrong password (it avoids confirming which accounts
      // exist) but wrong for an unconfirmed signup: the credentials are
      // correct, the account just isn't activated, and telling someone
      // their password is wrong sends them round the reset loop forever.
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
        const infoEl = document.getElementById('authInfo');
        if (infoEl) {
          infoEl.innerHTML =
            'Your account exists but the email address has not been confirmed yet. ' +
            'Check your inbox (and spam folder) for the confirmation link. ' +
            '<a href="#" id="resendConfirmation">Send it again</a>.';
          infoEl.style.display = 'block';
          document.getElementById('resendConfirmation').addEventListener('click', async (ev) => {
            ev.preventDefault();
            await supabaseClient.auth.resend({ type: 'signup', email });
            infoEl.textContent = 'Confirmation email sent. It can take a minute to arrive.';
          });
        } else {
          showAuthError(errorEl, 'Your email address has not been confirmed yet — check your inbox for the confirmation link.');
        }
        return;
      }
      if (msg.includes('rate limit') || msg.includes('too many')) {
        showAuthError(errorEl, 'Too many attempts. Wait a minute and try again.');
        return;
      }
      showAuthError(errorEl, 'Incorrect email or password.');
      return;
    }

    window.location.href = 'dashboard.html';
  });
}

// -------- FORGOT PASSWORD: request reset email --------
const resetRequestForm = document.getElementById('resetRequestForm');
if (resetRequestForm && SUPABASE_READY) {
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
// Landing here without a valid recovery session (expired link, link
// opened in a different browser, or someone typing the URL directly)
// used to fail only at submit time, with Supabase's raw "Auth session
// missing!" -- which reads like a bug rather than an expired link.
const setNewPasswordForm = document.getElementById('setNewPasswordForm');
if (setNewPasswordForm && SUPABASE_READY) {
  (async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      const errorEl = document.getElementById('authError');
      showAuthError(errorEl,
        'This password reset link is invalid or has expired. Request a new one from the "Forgot password?" link on the log in page.');
      document.getElementById('setNewPasswordBtn').disabled = true;
    }
  })();

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

    const confirmEl = document.getElementById('passwordConfirm');
    if (confirmEl && password !== confirmEl.value) {
      showAuthError(errorEl, 'The two passwords do not match.');
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
  if (supabaseClient) await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

// -------- ROUTE PROTECTION (used on dashboard pages) --------
async function requireAuth() {
  if (!requireSupabase()) return null;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}
