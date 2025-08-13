// 注册函数：提交用户名、密码、邮箱，注册成功后自动登录并跳转主页
    async function register() {
      const username = document.getElementById('reg_user').value;
      const password = document.getElementById('reg_pass').value;
      const email = document.getElementById('reg_email').value;
      const repassword = document.getElementById('reg_repass').value;
      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, email, repassword })
        });

        const result = await res.json();
        alert(result.message);

        if (result.status === 'success') {
          // 注册成功后自动登录
          await loginAfterRegister(username, password);
        }
      } catch (error) {
        console.error('注册出错:', error);
        alert('注册失败，请检查网络或稍后再试');
      }
    }

    // 注册后自动登录函数
    async function loginAfterRegister(username, password) {
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.status === 'success') {
          alert('注册并登录成功');
          window.location.href = '/'; // 跳转主页
        } else {
          alert('登录失败：' + data.message);
        }
      } catch (err) {
        console.error('自动登录出错:', err);
        alert('自动登录失败');
      }
    }

    // 登录函数：通过输入框获取用户名和密码
    async function login() {
      const username = document.getElementById('log_user').value;
      const password = document.getElementById('log_pass').value;

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        alert(data.message);

        if (data.status === 'success') {
          window.location.href = '/'; // 跳转主页
        }
      } catch (error) {
        console.error('登录出错:', error);
        alert('登录失败，请检查网络或稍后再试');
      }
    }

    function toggleForm() {
      const loginForm = document.getElementById('loginForm');
      const registerForm = document.getElementById('registerForm');
      const formTitle = document.getElementById('formTitle');
      if (loginForm.style.display === 'none') {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        formTitle.innerText = 'Log in';
      } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        formTitle.innerText = 'Sign Up';
      }
    }