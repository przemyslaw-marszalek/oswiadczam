#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 Konfiguracja e-mail dla aplikacji Oświadczenie Powypadkowe\n');

const questions = [
  {
    key: 'SMTP_HOST',
    question: 'Serwer SMTP (domyślnie: smtp.gmail.com): ',
    default: 'smtp.gmail.com'
  },
  {
    key: 'SMTP_PORT',
    question: 'Port SMTP (domyślnie: 587): ',
    default: '587'
  },
  {
    key: 'SMTP_USER',
    question: 'Twój adres e-mail: ',
    default: ''
  },
  {
    key: 'SMTP_PASS',
    question: 'Hasło aplikacji (nie zwykłe hasło!): ',
    default: ''
  }
];

let config = {};

function askQuestion(index) {
  if (index >= questions.length) {
    saveConfig();
    return;
  }

  const q = questions[index];
  rl.question(q.question, (answer) => {
    config[q.key] = answer.trim() || q.default;
    askQuestion(index + 1);
  });
}

function saveConfig() {
  console.log('\n📝 Zapisuję konfigurację do pliku .env...\n');
  
  let envContent = '# Konfiguracja e-mail dla aplikacji Oświadczenie Powypadkowe\n';
  envContent += '# Wygenerowane automatycznie przez setup-email.js\n\n';
  
  Object.keys(config).forEach(key => {
    envContent += `${key}=${config[key]}\n`;
  });
  
  envContent += '\n# Instrukcje dla Gmail:\n';
  envContent += '# 1. Idź na https://myaccount.google.com/security\n';
  envContent += '# 2. Włącz "Weryfikacja dwuetapowa"\n';
  envContent += '# 3. Wygeneruj "Hasło aplikacji" dla tej aplikacji\n';
  envContent += '# 4. Użyj tego hasła zamiast zwykłego hasła\n';
  
  try {
    fs.writeFileSync('.env', envContent);
    console.log('✅ Konfiguracja zapisana do pliku .env');
    console.log('\n📋 Następne kroki:');
    console.log('1. Sprawdź czy weryfikacja dwuetapowa jest włączona w Gmail');
    console.log('2. Wygeneruj hasło aplikacji jeśli jeszcze tego nie zrobiłeś');
    console.log('3. Zrestartuj serwer: npm start');
    console.log('4. Przetestuj funkcję e-mail na http://localhost:4000');
  } catch (error) {
    console.error('❌ Błąd zapisywania pliku .env:', error.message);
  }
  
  rl.close();
}

console.log('📧 Ten skrypt pomoże Ci skonfigurować e-mail.\n');
console.log('💡 Dla Gmail potrzebujesz "Hasła aplikacji" - nie zwykłego hasła!\n');

askQuestion(0);

