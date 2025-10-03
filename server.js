// server.js
// Prosty backend Node.js + Express dla PoC oświadczenia powypadkowego.
// Przechowuje dane w pamięci i udostępnia API dla frontendu.

// Załaduj zmienne środowiskowe z pliku .env
require('dotenv').config();

const path = require('path');
const express = require('express');
const fs = require('fs');
const http = require('http');
const multer = require('multer');
const { spawn } = require('child_process');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
// fetch jest dostępny globalnie w Node.js 18+

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware dla Basic Authentication (tylko w trybie testowym)
const basicAuth = (req, res, next) => {
  // Sprawdź czy jest włączona autoryzacja testowa
  if (process.env.TEST_AUTH_ENABLED === 'true') {
    const auth = req.headers.authorization;
    
    if (!auth || !auth.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Test Access"');
      return res.status(401).send('Authentication required for testing');
    }
    
    const credentials = Buffer.from(auth.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    const testUser = process.env.TEST_AUTH_USER || 'test';
    const testPass = process.env.TEST_AUTH_PASS || 'test123';
    
    if (username !== testUser || password !== testPass) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Test Access"');
      return res.status(401).send('Invalid credentials');
    }
  }
  
  next();
};

// Zastosuj Basic Auth tylko do strony głównej (oprócz healthcheck i panelu admin)
app.use((req, res, next) => {
  // Pomiń auth dla healthcheck i panelu admin
  if (req.path === '/health' || req.path === '/healthcheck' || req.path === '/admin.html' || req.path.startsWith('/api/admin/')) {
    return next();
  }
  // Pomiń auth dla wszystkich innych ścieżek oprócz strony głównej
  if (req.path !== '/' && req.path !== '/index.html') {
    return next();
  }
  return basicAuth(req, res, next);
});

// Healthcheck endpoint dla Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/healthcheck', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Email configuration (PoC - użyj własnych ustawień SMTP)
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
  }
});

// Sprawdź czy e-mail jest skonfigurowany
const isEmailConfigured = () => {
  const user = process.env.SMTP_USER || 'your-email@gmail.com';
  const pass = process.env.SMTP_PASS || 'your-app-password';
  return user !== 'your-email@gmail.com' && pass !== 'your-app-password';
};

// In-memory storage + prosty zapis na dysk (PoC). W realnej aplikacji zamień na bazę danych.
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'statements.json');
ensureDir(dataDir);
const memoryStore = {
  statements: loadStatements(dataFile), // lista złożonych oświadczeń
};

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
// Upload audio (multipart) – do transkrypcji po stronie serwera
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });

// POST /api/ai/transcribe – transkrypcja nagrania audio (Whisper lokalny, jeśli skonfigurowany)
app.post('/api/ai/transcribe', upload.single('audio'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Brak pliku audio' });

  // Domyślne ścieżki dla macOS/Homebrew + projektowy katalog models
  const defaultWhisperBin = '/opt/homebrew/bin/whisper-cpp';
  const defaultModelPath = path.join(__dirname, 'models', 'ggml-base.bin');
  const whisperBin = process.env.WHISPER_BIN || defaultWhisperBin; // np. /opt/homebrew/bin/whisper-cpp
  const whisperModel = process.env.WHISPER_MODEL || defaultModelPath; // np. /Users/.../wypadek/models/ggml-base.bin
  // Jeśli plik modelu lub binarka nie istnieje, komunikat 501 z instrukcją
  const fs = require('fs');
  if (!fs.existsSync(whisperBin) || !fs.existsSync(whisperModel)) {
    return res.status(501).json({ error: 'Transkrypcja nie skonfigurowana. Uruchom: npm run setup:whisper' });
  }

  try {
    const transcript = await runWhisper(whisperBin, whisperModel, file.buffer);
    res.json({ ok: true, transcript });
  } catch (e) {
    console.error('Whisper error', e);
    res.status(500).json({ error: 'Błąd transkrypcji' });
  }
});

// Serwowanie plików statycznych z katalogu głównego (index.html, main.js, style.css)
app.use(express.static(path.join(__dirname)));

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Middleware do sprawdzania hasła administratora
const checkAdminAuth = (req, res, next) => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const providedPassword = req.headers.authorization?.replace('Bearer ', '') || req.query.password;
  
  if (providedPassword === adminPassword) {
    next();
  } else {
    res.status(401).json({ error: 'Brak autoryzacji', message: 'Wymagane hasło administratora' });
  }
};

// Endpoint do logowania administratora
app.post('/api/admin/login', (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const { password } = req.body;
  
  if (password === adminPassword) {
    res.json({ success: true, message: 'Autoryzacja pomyślna' });
  } else {
    res.status(401).json({ success: false, message: 'Nieprawidłowe hasło' });
  }
});

// Admin panel (prosty widok) – serwuj dedykowany plik
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// API: Zapis oświadczenia (formularz + AI + QR token)
app.post('/api/statement', (req, res) => {
  const data = req.body || {};
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Minimalna walidacja PoC
  if (!data.driverAName || !data.vehicleAPlate || !data.location || !data.datetime) {
    return res.status(400).json({ error: 'Brak wymaganych pól: driverAName, vehicleAPlate, location, datetime' });
  }

  const record = { id, createdAt: new Date().toISOString(), ...data };
  
  // Log zdjęć uszkodzeń
  console.log(`[SAVE] Zdjęcia poszkodowanego: ${data.victimPhotosDataUrl ? data.victimPhotosDataUrl.length : 0}`);
  console.log(`[SAVE] Zdjęcia sprawcy: ${data.perpetratorPhotosDataUrl ? data.perpetratorPhotosDataUrl.length : 0}`);
  
  memoryStore.statements.push(record);
  // Zapis do pliku (best-effort)
  try {
    fs.writeFileSync(dataFile, JSON.stringify(memoryStore.statements, null, 2), 'utf8');
  } catch (e) {
    console.warn('Nie udało się zapisać statements.json:', e?.message || e);
  }
  res.json({ ok: true, id });
});

// API: Wyślij oświadczenie na e-mail
app.post('/api/statement/email', async (req, res) => {
  const data = req.body || {};
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Minimalna walidacja PoC
  if (!data.driverAName || !data.vehicleAPlate || !data.location || !data.datetime) {
    return res.status(400).json({ error: 'Brak wymaganych pól: driverAName, vehicleAPlate, location, datetime' });
  }

  // Sprawdź czy są adresy e-mail
  if (!data.driverAEmail && !data.driverBEmail) {
    return res.status(400).json({ error: 'Brak adresów e-mail sprawcy i poszkodowanego' });
  }

  // Sprawdź czy e-mail jest skonfigurowany
  if (!isEmailConfigured()) {
    return res.status(400).json({ 
      error: 'E-mail nie jest skonfigurowany. Edytuj plik .env i ustaw SMTP_USER oraz SMTP_PASS.',
      instructions: {
        step1: 'Idź na https://myaccount.google.com/security',
        step2: 'Włącz weryfikację dwuetapową',
        step3: 'Wygeneruj hasło aplikacji',
        step4: 'Edytuj plik .env: nano .env',
        step5: 'Ustaw SMTP_USER=twoj-email@gmail.com i SMTP_PASS=twoje-haslo-aplikacji'
      }
    });
  }

  const record = { id, createdAt: new Date().toISOString(), ...data };
  
  // Log zdjęć uszkodzeń
  console.log(`[EMAIL] Zdjęcia poszkodowanego: ${data.victimPhotosDataUrl ? data.victimPhotosDataUrl.length : 0}`);
  console.log(`[EMAIL] Zdjęcia sprawcy: ${data.perpetratorPhotosDataUrl ? data.perpetratorPhotosDataUrl.length : 0}`);
  
  memoryStore.statements.push(record);
  
  // Zapis do pliku (best-effort)
  try {
    fs.writeFileSync(dataFile, JSON.stringify(memoryStore.statements, null, 2), 'utf8');
  } catch (e) {
    console.warn('Nie udało się zapisać statements.json:', e?.message || e);
  }

  // Generuj PDF w pamięci
  const pdfBuffer = await generatePDFBuffer(record);
  
  // Przygotuj adresy e-mail
  const emailAddresses = [];
  if (data.driverAEmail) emailAddresses.push(data.driverAEmail);
  if (data.driverBEmail && data.driverBEmail !== data.driverAEmail) emailAddresses.push(data.driverBEmail);

  // Przygotuj załączniki
  const attachments = [
    {
      filename: `oswiadczenie_${id}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }
  ];

  // Dodaj zdjęcia jako załączniki
  if (data.victimPhotosDataUrl && data.victimPhotosDataUrl.length > 0) {
    data.victimPhotosDataUrl.forEach((photo, index) => {
      const base64Data = photo.dataUrl.split(',')[1];
      attachments.push({
        filename: `zdjecie_poszkodowany_${index + 1}.${photo.type.split('/')[1]}`,
        content: base64Data,
        encoding: 'base64',
        contentType: photo.type
      });
    });
  }

  if (data.perpetratorPhotosDataUrl && data.perpetratorPhotosDataUrl.length > 0) {
    data.perpetratorPhotosDataUrl.forEach((photo, index) => {
      const base64Data = photo.dataUrl.split(',')[1];
      attachments.push({
        filename: `zdjecie_sprawca_${index + 1}.${photo.type.split('/')[1]}`,
        content: base64Data,
        encoding: 'base64',
        contentType: photo.type
      });
    });
  }

  // Wyślij e-mail
  try {
    const mailOptions = {
      from: process.env.SMTP_USER || 'your-email@gmail.com',
      to: emailAddresses.join(', '),
      subject: `Oświadczenie sprawcy kolizji - ${data.location}`,
      text: `Załączamy oświadczenie sprawcy kolizji drogowej z dnia ${data.datetime} w miejscu ${data.location}.`,
      html: `
        <h2>Oświadczenie sprawcy kolizji drogowej</h2>
        <p><strong>Data i miejsce zdarzenia:</strong> ${data.datetime} - ${data.location}</p>
        <p><strong>Sprawca:</strong> ${data.driverAName}</p>
        <p><strong>Poszkodowany:</strong> ${data.driverBName || 'Nie podano'}</p>
        <p>W załącznikach znajdą Państwo:</p>
        <ul>
          <li>Oświadczenie sprawcy kolizji w formacie PDF</li>
          <li>Zdjęcia uszkodzeń pojazdów</li>
        </ul>
        <p>Dokument został automatycznie zapisany w systemie pod numerem: ${id}</p>
      `,
      attachments: attachments
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ ok: true, id, message: 'E-mail został wysłany pomyślnie' });
  } catch (emailError) {
    console.error('Email sending error:', emailError);
    res.status(500).json({ 
      error: 'Błąd wysyłania e-maila: ' + emailError.message,
      details: emailError.response || 'Sprawdź konfigurację SMTP w pliku .env'
    });
  }
});

// API: Analiza zdjęć używając lokalnego modelu AI
app.post('/api/ai/analyze-image', async (req, res) => {
  const { imageData, imageType, analysisType } = req.body || {};
  
  if (!imageData || !analysisType) {
    return res.status(400).json({ 
      ok: false, 
      error: 'Brak danych obrazu lub typu analizy' 
    });
  }

  try {
    // Obsługa zarówno pojedynczych obrazów jak i tablic obrazów
    let imagesToProcess = [];
    
    if (Array.isArray(imageData)) {
      // Jeśli to tablica obrazów, przetwórz każdy
      imagesToProcess = imageData.map(img => {
        if (typeof img === 'string') {
          return img.replace(/^data:image\/[a-z]+;base64,/, '');
        }
        return img;
      });
    } else {
      // Jeśli to pojedynczy obraz
      imagesToProcess = [imageData.replace(/^data:image\/[a-z]+;base64,/, '')];
    }
    
    console.log(`[AI] Przetwarzam ${imagesToProcess.length} obraz(ów) dla ${analysisType}`);
    
    // Przetwórz obrazy w zależności od typu analizy
    let geminiResult = null;
    
    if (process.env.GEMINI_API_KEY) {
      console.log(`[AI] Trying Gemini API for ${analysisType}...`);
      
      if ((analysisType === 'license' || analysisType === 'damage') && imagesToProcess.length > 1) {
        // Dla prawa jazdy i uszkodzeń analizuj wszystkie obrazy i połącz wyniki
        console.log(`[AI] Analizuję ${imagesToProcess.length} obrazy ${analysisType}...`);
        
        const results = [];
        for (let i = 0; i < imagesToProcess.length; i++) {
          console.log(`[AI] Analizuję obraz ${i + 1}/${imagesToProcess.length}...`);
          const result = await analyzeImageWithGemini(imagesToProcess[i], analysisType);
          if (result) {
            results.push(result);
          }
        }
        
        // Połącz wyniki - pierwszy obraz ma priorytet dla podstawowych danych
        geminiResult = results[0] || {};
        
        // Jeśli pierwszy obraz nie dał wyników, spróbuj z kolejnymi
        if (Object.keys(geminiResult).length === 0 && results.length > 1) {
          for (let i = 1; i < results.length; i++) {
            if (results[i] && Object.keys(results[i]).length > 0) {
              geminiResult = results[i];
              break;
            }
          }
        }
        
        // Połącz dane z wszystkich obrazów (dla prawa jazdy - front i tył)
        if (analysisType === 'license' && results.length > 1) {
          for (let i = 1; i < results.length; i++) {
            if (results[i]) {
              // Połącz dane, preferując nie-null wartości
              Object.keys(results[i]).forEach(key => {
                if (results[i][key] !== null && results[i][key] !== undefined && 
                    (geminiResult[key] === null || geminiResult[key] === undefined)) {
                  geminiResult[key] = results[i][key];
                }
              });
            }
          }
        }
        
        console.log(`[AI] Połączone wyniki z ${results.length} obrazów:`, geminiResult);
        
        // Sprawdź czy mamy jakiekolwiek wyniki
        if (Object.keys(geminiResult).length === 0) {
          console.log(`[AI] ⚠️ Brak wyników z Gemini API dla ${analysisType} - wszystkie obrazy zwróciły null`);
        }
      } else {
        // Dla innych typów analizuj tylko pierwszy obraz
        const imageBase64 = imagesToProcess[0];
        geminiResult = await analyzeImageWithGemini(imageBase64, analysisType);
      }
      
      console.log(`[AI] Gemini result for ${analysisType}:`, geminiResult);
      
      if (geminiResult && Object.values(geminiResult).some(v => v !== null)) {
        console.log(`[AI] Gemini API success for ${analysisType}:`, geminiResult);
        return res.json({ 
          ok: true, 
          analysis: geminiResult,
          source: 'gemini'
        });
      } else {
        console.log(`[AI] Gemini API returned no valid data for ${analysisType}, but continuing with Gemini result anyway`);
        // Nie przełączaj się na Ollama - zwróć wynik Gemini nawet jeśli jest null
        return res.json({ 
          ok: true, 
          analysis: geminiResult || {},
          source: 'gemini'
        });
      }
    }
    
    // Fallback to Ollama
    console.log(`[AI] Falling back to Ollama for ${analysisType}...`);
    const model = process.env.OLLAMA_MODEL || 'llava:13b';
    let prompt = '';
    
    switch (analysisType) {
      case 'license':
        prompt = buildLicenseAnalysisPrompt();
        break;
      case 'vehicle':
        prompt = buildVehicleAnalysisPrompt();
        break;
      case 'damage':
        prompt = buildDamageAnalysisPrompt();
        break;
      default:
        return res.status(400).json({ 
          ok: false, 
          error: 'Nieznany typ analizy' 
        });
    }
    
    // Dodaj instrukcje preprocessingu dla lepszego OCR
    const enhancedPrompt = `${prompt}

INSTRUKCJE PREPROCESSING:
- Jeśli obraz jest ciemny, zwiększ kontrast
- Jeśli tekst jest rozmyty, wyostrz go
- Jeśli obraz jest przekręcony, obróć go
- Skup się na czytelności tekstu

ANALIZUJ TERAZ:`;
    
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: enhancedPrompt,
        images: [imageBase64],
        stream: false,
        options: {
          temperature: 0.0, // Zmniejszona temperatura dla lepszego OCR
          top_p: 0.9,
          top_k: 40,
        },
        keep_alive: '5m',
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

          const result = await response.json();
          const analysisResult = parseAIResponse(result.response);
          
          console.log(`[AI] Analiza ${analysisType} zakończona pomyślnie`);
          console.log(`[AI] Surowa odpowiedź:`, result.response);
          console.log(`[AI] Sparsowany wynik:`, analysisResult);
          console.log(`[AI] Otrzymane dane obrazu:`, imageData ? 'MA DANE' : 'BRAK DANYCH');
          console.log(`[AI] Długość danych obrazu:`, imageData ? imageData.length : 0);
          console.log(`[AI] Typ danych obrazu:`, typeof imageData);
          
          return res.json({ 
            ok: true, 
            analysis: analysisResult,
            rawResponse: result.response,
            source: 'ollama'
          });

  } catch (error) {
    console.error(`[AI] Błąd analizy ${analysisType}:`, error.message);
    return res.status(500).json({ 
      ok: false, 
      error: `Błąd analizy: ${error.message}` 
    });
  }
});

// API: Symulacja AI – analiza podyktowanego tekstu i generowanie brakujących pól
// W realnym wdrożeniu podłącz usługę AI (OpenAI API/Cursor lokalny) poniżej.
app.post('/api/ai/analyze', async (req, res) => {
  const { transcript = '' } = req.body || {};

  // Spróbuj użyć lokalnego modelu Llama via Ollama (http://localhost:11434)
  try {
    const model = process.env.OLLAMA_MODEL || 'llava:7b';
    const prompt = buildExtractionPrompt(transcript);
    const json = await callOllama(model, prompt);
    if (json && json.fields) {
      console.log(`[AI] Ollama used successfully (model: ${model})`);
      return res.json({ ok: true, fields: json.fields });
    }
  } catch (e) {
    // Fallback do heurystyk poniżej
    console.warn('Ollama extraction failed, falling back to heuristics:', e?.message || e);
  }

  // Bardzo prosta heurystyka PoC: wyciągnij kilka pól, resztę zasymuluj
  const lower = transcript.toLowerCase();

  const maybeAnyPlate = (lower.match(/[a-z]{2,3}\s?\d{4,6}/i) || [])[0];
  const hasCollision = lower.includes('koliz') || lower.includes('stłuc') || lower.includes('wypad');

  // Heurystyki prostych pól A (opcjonalne – nadpiszemy tylko puste)
  let driverAName = null;
  const nameMatch = lower.match(/nazywam\s+się\s+([a-ząćęłńóśźż]+\s+[a-ząćęłńóśźż]+)/i);
  if (nameMatch) driverAName = capitalizeWords(nameMatch[1]);

  let vehicleAPlate = null;
  if (maybeAnyPlate) vehicleAPlate = maybeAnyPlate.toUpperCase().replace(/\s+/g, ' ');

  let locationGuess = null;
  const locMatch = transcript.match(/(?:w|na)\s+([A-ZŻŹĆĄŚĘŁÓŃ][^,.\n]{2,50})/);
  if (locMatch) locationGuess = locMatch[1].trim();

  const nowIso = new Date().toISOString().slice(0,16); // yyyy-MM-ddTHH:mm

  // Zwracamy uzupełnienia — pola opcjonalne
  const aiFields = {
    driverBName: 'Jan Kowalski',
    driverBPolicyNumber: 'POL-PL-123456',
    vehicleBPlate: maybeAnyPlate || 'WX 12345',
    incidentDetails: hasCollision
      ? 'Kolizja na skrzyżowaniu, brak osób poszkodowanych.'
      : 'Zdarzenie drogowe bez poszkodowanych.',
    // Pola A – tylko propozycje (frontend ustawi je, jeśli puste)
    driverAName: driverAName || null,
    vehicleAPlate: vehicleAPlate || null,
    location: locationGuess || null,
    datetime: nowIso,
  };

  res.json({ ok: true, fields: aiFields });
});

// API: Parsowanie tokenu QR mObywatel (PoC)
// W realnym wdrożeniu zweryfikuj podpis i odszyfruj token.
app.post('/api/qr/parse', (req, res) => {
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'Brak tokenu QR' });
  }

  let parsed;
  try {
    parsed = JSON.parse(token);
  } catch (e) {
    // Symulacja PoC – jeżeli nie jest prawidłowy JSON, zwróć przykładowe dane
    parsed = null;
  }

  const driverB = parsed?.driverB || {
    name: 'Jan Kowalski',
    policyNumber: 'POL-PL-123456',
    vehiclePlate: 'WX 12345',
    documentId: 'ABC123456',
  };

  res.json({ ok: true, driverB });
});

// API: Weryfikacja polisy OC na podstawie numeru rejestracyjnego
app.post('/api/policy/verify', async (req, res) => {
  const { plateNumber } = req.body || {};
  
  if (!plateNumber) {
    return res.status(400).json({ error: 'Brak numeru rejestracyjnego' });
  }

  try {
    // TODO: Integracja z prawdziwym API UFG
    // const ufgResponse = await fetch(`https://api.ufg.pl/oc/${plateNumber}`, {
    //   headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
    // });
    
    // Symulacja weryfikacji dla PoC
    const isValid = await simulatePolicyVerification(plateNumber);
    
    if (isValid) {
      res.json({
        ok: true,
        valid: true,
        policyNumber: generatePolicyNumber(),
        insurer: generateInsurerName(),
        validUntil: generateValidUntilDate(),
        message: 'Polisa OC jest ważna'
      });
    } else {
      res.json({
        ok: true,
        valid: false,
        message: 'Nie znaleziono ważnej polisy OC dla tego pojazdu'
      });
    }
  } catch (error) {
    console.error('Policy verification error:', error);
    res.status(500).json({ error: 'Błąd podczas weryfikacji polisy' });
  }
});

// API: Lista zapisanych oświadczeń (podgląd PoC)
app.get('/api/statement', checkAdminAuth, (req, res) => {
  res.json({ ok: true, items: memoryStore.statements });
});

// Funkcja do wyciągania miejscowości z opisu lokalizacji używając AI
async function extractCityWithAI(locationText) {
  if (!locationText || locationText.trim() === '') {
    return '';
  }

  try {
    const prompt = `Z poniższego opisu miejsca zdarzenia wyciągnij tylko nazwę miejscowości (miasto, wieś). Ignoruj numery, ulice, współrzędne GPS, skróty.

Przykłady:
- "2025-10-01T11:00 - 362G, Kolumny, Wiskitno A-Las" → "Wiskitno A-Las"
- "Kraków, ul. Długa 12" → "Kraków"  
- "Warszawa, al. Jerozolimskie 100" → "Warszawa"
- "Gdańsk" → "Gdańsk"
- "50.123456, 19.987654, Kraków" → "Kraków"

Opis miejsca: "${locationText}"

Zwróć tylko nazwę miejscowości bez dodatkowych słów:`;

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          max_tokens: 50
        }
      }),
      timeout: 10000
    });

    if (response.ok) {
      const data = await response.json();
      const city = data.response?.trim() || '';
      console.log(`[AI] Extracted city: "${city}" from: "${locationText}"`);
      return city;
    }
  } catch (error) {
    console.warn('AI city extraction failed, using fallback:', error.message);
  }

  // Fallback: użyj prostszej logiki
  const parts = locationText.split(',');
  if (parts.length > 1) {
    // Znajdź część która wygląda jak miejscowość (zawiera litery, nie tylko cyfry)
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].trim();
      if (part && /[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(part) && !/^\d+$/.test(part)) {
        return part;
      }
    }
  }
  
  return locationText.trim();
}

// Funkcja do generowania PDF w pamięci (dla e-maili)
async function generatePDFBuffer(item) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      margin: 40,
      autoFirstPage: true,
      compress: false
    });
    
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // Użyj fontów z projektu lub domyślnych fontów PDFKit
    let fontName = 'Helvetica';
    let boldFontName = 'Helvetica-Bold';
    
    try {
      // Sprawdź czy fonty Liberation Sans są dostępne w projekcie
      const fontPath = path.join(__dirname, 'fonts', 'LiberationSans-Regular.ttf');
      const boldFontPath = path.join(__dirname, 'fonts', 'LiberationSans-Bold.ttf');
      const fs = require('fs');
      
      if (fs.existsSync(fontPath) && fs.existsSync(boldFontPath)) {
        doc.registerFont('LiberationSans', fontPath);
        doc.registerFont('LiberationSans-Bold', boldFontPath);
        fontName = 'LiberationSans';
        boldFontName = 'LiberationSans-Bold';
        console.log('[PDF] Using Liberation Sans fonts from project');
      } else {
        console.log('[PDF] Liberation Sans fonts not found, using default Helvetica fonts');
      }
    } catch (error) {
      console.log('[PDF] Using default Helvetica fonts (fallback):', error.message);
    }

    // Format zgodny z wzorem oświadczenia sprawcy kolizji
    // Prawy górny róg - miejscowość i data
    const location = item.location || '';
    const datetime = item.datetime || '';
    const dateOnly = datetime ? new Date(datetime).toLocaleDateString('pl-PL') : '';
    
    // Wyciągnij miejscowość używając AI
    extractCityWithAI(location).then(cityOnly => {
      doc.fontSize(12).font(fontName).text(`${cityOnly}, ${dateOnly}`, { align: 'right' });
      doc.moveDown(3); // Dodano 2 dodatkowe linie (było 1, teraz 3)
      
      // Pusta linia przed tytułem
      doc.moveDown(1);
      
      doc.fontSize(16).font(boldFontName).text('OŚWIADCZENIE SPRAWCY KOLIZJI DROGOWEJ', { align: 'center' });
      
      // Pusta linia po tytule
      doc.moveDown(2);
      
      doc.fontSize(12).font(boldFontName).text('Data i miejsce zdarzenia:');
      doc.font(fontName).text(`${item.datetime || ''} - ${item.location || ''}`);
      doc.moveDown(0.5);
      
      doc.font(boldFontName).text('Dane sprawcy kolizji drogowej:');
      doc.font(fontName).text(`Imię i nazwisko: ${item.driverAName || ''}`);
      doc.text(`zamieszkały w: ${item.driverAAddress || '................................'}`);
      doc.text(`posiadający prawo jazdy kat. ${item.driverALicenseCategory || '....'} seria i nr ${item.driverALicenseNumber || '................'}`);
      doc.text(`wydane przez: ${item.driverALicenseIssuer || '................................'}`);
      doc.text(`pojazd marki ${item.vehicleAMake || '................'} nr rejestracyjny ${item.vehicleAPlate || ''}`);
      // Automatyczne wypełnienie właściciela pojazdu sprawcy
      const vehicleAOwnerText = item.vehicleAOwner || item.driverAName || '................................';
      doc.text(`należący do ${vehicleAOwnerText}`);
      doc.text(`ubezpieczony w zakresie OC (nazwa ubezpieczyciela, nr polisy): ${item.driverAPolicyInfo || '................................'}`);
      doc.text(`polisa ważna do ${item.driverAPolicyValidUntil || '................................'}`);
      doc.moveDown(0.5);
      
      doc.font(boldFontName).text('Dane poszkodowanego w kolizji drogowej:');
      doc.font(fontName).text(`Imię i nazwisko: ${item.driverBName || ''}`);
      doc.text(`zamieszkały w: ${item.driverBAddress || '................................'}`);
      doc.text(`posiadający prawo jazdy kat. ${item.driverBLicenseCategory || '....'} seria i nr ${item.driverBLicenseNumber || '................'}`);
      doc.text(`wydane przez: ${item.driverBLicenseIssuer || '................................'}`);
      doc.text(`pojazd marki ${item.vehicleBMake || '................'} nr rejestracyjny ${item.vehicleBPlate || ''}`);
      // Automatyczne wypełnienie właściciela pojazdu poszkodowanego
      const vehicleBOwnerText = item.vehicleBOwner || item.driverBName || '................................';
      doc.text(`należący do ${vehicleBOwnerText}`);
      doc.text(`ubezpieczony w zakresie OC (nazwa ubezpieczyciela, nr polisy): ${item.driverBPolicyInfo || '................................'}`);
      doc.text(`polisa ważna do ${item.driverBPolicyValidUntil || '................................'}`);
      doc.moveDown(0.5);
      
      doc.font(boldFontName).text('Okoliczności zdarzenia:');
      doc.font(fontName).text(item.incidentDetails || '................................');
      doc.moveDown(0.5);
      
      doc.font(boldFontName).text('Opis uszkodzeń pojazdu poszkodowanego:');
      doc.font(fontName).text(item.damageDescriptionVictim || '................................');
      doc.moveDown(0.5);
      
      doc.font(boldFontName).text('Opis uszkodzeń pojazdu sprawcy:');
      doc.font(fontName).text(item.damageDescriptionPerpetrator || '................................');
      doc.moveDown(0.5);
      
      // Dodatkowe informacje
      doc.font(boldFontName).text('Dodatkowe informacje:');
      doc.font(fontName).text(item.additionalInfo || '................................');
      doc.moveDown(0.5);
      
      // Informacje o polisach
      if (item.driverAPolicyInfo || item.driverBPolicyInfo) {
        doc.font(boldFontName).text('Informacje o ubezpieczeniach:');
        if (item.driverAPolicyInfo) {
          doc.font(fontName).text(`Sprawca: ${item.driverAPolicyInfo}`);
        }
        if (item.driverBPolicyInfo) {
          doc.font(fontName).text(`Poszkodowany: ${item.driverBPolicyInfo}`);
        }
        doc.moveDown(0.5);
      }
      
      // Podpisy elektroniczne - zawsze w tej samej linii poziomej
      doc.moveDown(1);
      
      // Sprawdź czy podpisy zmieszczą się na aktualnej stronie
      const signatureHeight = 60;
      const signatureTextHeight = 20;
      const totalSignatureHeight = signatureHeight + signatureTextHeight + 20; // margines
      
      // Jeśli nie ma miejsca na podpisy, przenieś część tekstu na drugą stronę
      if (doc.y + totalSignatureHeight > doc.page.height - 50) {
        console.log(`[PDF] Not enough space for signatures. Moving to page 2.`);
        
        // Przenieś część tekstu na drugą stronę
        doc.addPage();
        
        // Sekcje "Dodatkowe informacje" i "Informacje o ubezpieczeniach" 
        // są już dodane na pierwszej stronie przed podpisami
        
        console.log(`[PDF] Added content to page 2. New Y: ${doc.y}`);
      }
      
      // Ustaw stałą pozycję Y dla podpisów - oblicz ją dokładnie
      const signatureY = doc.y;
      
      console.log(`[PDF] Signature Y position: ${signatureY}`);
      
      // Podpis sprawcy (lewa strona) - X=50
      if (item.driverASignature) {
        try {
          const signatureBuffer = Buffer.from(item.driverASignature.split(',')[1], 'base64');
          doc.image(signatureBuffer, 50, signatureY, { width: 150, height: signatureHeight });
          doc.text('podpis sprawcy kolizji', 50, signatureY + signatureHeight + 10);
          console.log(`[PDF] Sprawca signature placed at Y=${signatureY}`);
        } catch (e) {
          console.error('[PDF] Error placing sprawca signature:', e);
          doc.text('podpis sprawcy kolizji', 50, signatureY);
        }
      } else {
        doc.text('podpis sprawcy kolizji', 50, signatureY);
        console.log(`[PDF] Sprawca text placed at Y=${signatureY}`);
      }
      
      // Podpis poszkodowanego (prawa strona) - X=300, TEN SAM Y
      if (item.driverBSignature) {
        try {
          const signatureBuffer = Buffer.from(item.driverBSignature.split(',')[1], 'base64');
          doc.image(signatureBuffer, 300, signatureY, { width: 150, height: signatureHeight });
          
          // Podpis poszkodowanego w 2 liniach z wysrodkowaniem
          const textY = signatureY + signatureHeight + 10;
          doc.text('podpis poszkodowanego', 300, textY);
          doc.text('lub kierującego pojazdem poszkodowanego', 300, textY + 12);
          
          console.log(`[PDF] Poszkodowany signature placed at Y=${signatureY}`);
        } catch (e) {
          console.error('[PDF] Error placing poszkodowany signature:', e);
          
          // Podpis poszkodowanego w 2 liniach z wysrodkowaniem (bez podpisu)
          doc.text('podpis poszkodowanego', 300, signatureY);
          doc.text('lub kierującego pojazdem poszkodowanego', 300, signatureY + 12);
        }
      } else {
        // Podpis poszkodowanego w 2 liniach z wysrodkowaniem (bez podpisu)
        doc.text('podpis poszkodowanego', 300, signatureY);
        doc.text('lub kierującego pojazdem poszkodowanego', 300, signatureY + 12);
        console.log(`[PDF] Poszkodowany text placed at Y=${signatureY}`);
      }

      doc.end();
    }).catch(reject);
  });
}

// Generowanie PDF dla konkretnego oświadczenia
app.get('/api/statement/:id/pdf', checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const item = memoryStore.statements.find((s) => s.id === id);
  if (!item) return res.status(404).send('Not found');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="oswiadczenie_${id}.pdf"`);

  try {
    console.log(`[PDF] Generating PDF for statement ${id}`);
    const pdfBuffer = await generatePDFBuffer(item);
    console.log(`[PDF] PDF generated successfully, size: ${pdfBuffer.length} bytes`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[PDF] PDF generation error:', error);
    console.error('[PDF] Error stack:', error.stack);
    res.status(500).json({ 
      error: 'PDF generation failed', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Funkcje pomocnicze do weryfikacji polisy (symulacja dla PoC)
async function simulatePolicyVerification(plateNumber) {
  // Symulacja - zawsze zwraca pozytywny wynik dla weryfikacji PoC
  // W rzeczywistej implementacji tutaj będzie wywołanie API UFG
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000)); // Symulacja opóźnienia sieci
  
  // Zawsze zwracaj true dla celów weryfikacji
  return true;
}

function generatePolicyNumber() {
  const prefixes = ['OC', 'AC', 'NNW'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 900000) + 100000;
  return `${prefix}${number}`;
}

function generateInsurerName() {
  const insurers = [
    'PZU SA',
    'Warta SA',
    'Allianz Polska SA',
    'Generali TU SA',
    'AXA Polska SA',
    'UNIQA TU SA',
    'Proama SA',
    'InterRisk SA'
  ];
  return insurers[Math.floor(Math.random() * insurers.length)];
}

function generateValidUntilDate() {
  const now = new Date();
  const validUntil = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)); // +1 rok
  return validUntil.toISOString().split('T')[0]; // Format YYYY-MM-DD
}

// Punkty integracji na przyszłość:
// - Podpis mObywatel: w endpointzie finalizacji dokumentu zweryfikuj podpis użytkownika
// - Baza danych: zastąp memoryStore trwałą bazą (np. Postgres), dodaj warstwę repozytorium
// - API UFG: zastąp simulatePolicyVerification prawdziwym wywołaniem API UFG

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Healthcheck available at: http://0.0.0.0:${PORT}/health`);
});

// Error handling
server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Pomocnicze: kapitalizacja słów imienia/nazwiska
function capitalizeWords(str) {
  return str
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Helpers: prosty odczyt/zapis danych
function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

function loadStatements(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Nie udało się odczytać statements.json – start z pustą listą:', e?.message || e);
    return [];
  }
}

// Zbuduj precyzyjny prompt do ekstrakcji pól. Wymagamy wyjścia wyłącznie JSON.
function buildExtractionPrompt(transcript) {
  return `Przeanalizuj poniższy opis zdarzenia drogowego i wyciągnij z niego informacje. Zwróć tylko JSON z polami:

{
  "fields": {
    "incidentDetails": "szczegółowy opis okoliczności zdarzenia",
    "damageDescriptionVictim": "opis uszkodzeń pojazdu poszkodowanego", 
    "damageDescriptionPerpetrator": "opis uszkodzeń pojazdu sprawcy",
    "additionalInfo": "dodatkowe informacje o zdarzeniu"
  }
}

Opis zdarzenia: "${transcript}"

Jeśli jakieś informacje nie są dostępne, zostaw puste pole. Skup się na analizie uszkodzeń i okoliczności zdarzenia.`;
}

// Minimalny klient do Ollama /api/generate (stream=false)
async function callOllama(model, prompt) {
  const body = JSON.stringify({
    model,
    prompt,
    // Stabilniejsze, bez strumieniowania – łatwiejszy parsing JSON
    stream: false,
    options: {
      temperature: 0,
    },
    keep_alive: '5m',
  });
  const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: Number(process.env.OLLAMA_TIMEOUT_MS || 60000),
  };
  const responseText = await httpRequest(options, body);
  // Ollama zwraca JSON z polem "response" (string). W nim powinien być JSON od modelu.
  const outer = JSON.parse(responseText);
  const raw = outer?.response?.trim() || '';
  // Spróbuj znaleźć blok JSON
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const jsonStr = raw.slice(start, end + 1);
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

// Uruchom lokalny binarny Whisper, przekazując mu audio ze stdin; zwróć tekst
function runWhisper(whisperBin, modelPath, audioBuffer) {
  return new Promise((resolve, reject) => {
    const os = require('os');
    const fs = require('fs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wypadek-audio-'));
    const inFile = path.join(tmpDir, 'recording.webm');
    const outBase = path.join(tmpDir, 'out');
    fs.writeFileSync(inFile, audioBuffer);
    // whisper-cpp (Homebrew) akceptuje -f <plik> i może wygenerować .txt przez -otxt -of <prefix>
    const args = ['-m', modelPath, '-l', 'pl', '-f', inFile, '-otxt', '-of', outBase];
    const proc = spawn(whisperBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      try {
        if (code === 0) {
          const txtPath = `${outBase}.txt`;
          const text = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8').trim() : '';
          resolve(text);
        } else {
          reject(new Error(err || `Whisper exited with code ${code}`));
        }
      } finally {
        // Sprzątanie
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    });
  });
}

// Funkcja sprawdzająca czy wynik analizy jest niepełny
function isResultIncomplete(result, analysisType) {
  if (!result || Object.keys(result).length === 0) {
    return true; // Pusty wynik
  }
  
  switch (analysisType) {
    case 'license':
      // Dla prawa jazdy wymagamy przynajmniej name i licenseNumber
      return !result.name || !result.licenseNumber;
    
    case 'vehicle':
      // Dla pojazdu wymagamy przynajmniej licensePlate i make
      return !result.licensePlate || !result.make;
    
    case 'damage':
      // Dla uszkodzeń wymagamy przynajmniej damageDescription
      return !result.damageDescription;
    
    default:
      return false;
  }
}

// Google Gemini API integration
async function analyzeImageWithGemini(imageBase64, analysisType, retryCount = 0) {
  const maxRetries = 1; // Maksymalnie 1 ponowienie
  
  try {
    const prompt = buildGeminiPrompt(analysisType);
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: imageBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.0,
          topK: 32,
          topP: 1,
          maxOutputTokens: 4096,
        }
      })
    });

    const data = await response.json();
    
    console.log(`[Gemini] Full response for ${analysisType}:`, JSON.stringify(data, null, 2));
    
    // Sprawdź czy to błąd API (np. 503)
    if (data.error) {
      console.log(`[Gemini] API Error for ${analysisType}:`, data.error);
      if (data.error.code === 503 && retryCount < maxRetries) {
        console.log(`[Gemini] ⚠️ Błąd 503 dla ${analysisType}, próbuję ponownie (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Czekaj 2 sekundy dla błędów API
        return await analyzeImageWithGemini(imageBase64, analysisType, retryCount + 1);
      }
      return null;
    }
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      if (data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
        const text = data.candidates[0].content.parts[0].text;
        console.log(`[Gemini] Raw response for ${analysisType}:`, text);
        const result = parseGeminiResponse(text, analysisType);
        
        // Sprawdź czy wynik jest pusty lub niepełny i czy możemy spróbować ponownie
        const isIncomplete = isResultIncomplete(result, analysisType);
        if (isIncomplete && retryCount < maxRetries) {
          console.log(`[Gemini] ⚠️ Niepełna odpowiedź dla ${analysisType}, próbuję ponownie (${retryCount + 1}/${maxRetries})...`);
          console.log(`[Gemini] Niepełny wynik:`, result);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Czekaj 1 sekundę
          return await analyzeImageWithGemini(imageBase64, analysisType, retryCount + 1);
        }
        
        return result;
      } else {
        console.log(`[Gemini] No parts found in response for ${analysisType}`);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

function buildGeminiPrompt(analysisType) {
  switch (analysisType) {
    case 'license':
      return `Jesteś ekspertem OCR specjalizującym się w analizie polskich praw jazdy. Przeanalizuj załączony obraz prawa jazdy i wyciągnij następujące informacje:

WYMAGANE POLA (zwróć null jeśli nie widzisz):
- name: Imię i nazwisko (UWAGA: Na polskim prawie jazdy imiona są w kolejności: pierwsze imię, drugie imię, nazwisko. Np. jeśli na dokumencie jest "MARSZAŁEK PRZEMYSŁAW MICHAŁ", to w polu name wpisz "PRZEMYSŁAW MICHAŁ MARSZAŁEK". Jeśli jest "MARSZAŁEK ALEKSANDRA JADWIGA", to wpisz "ALEKSANDRA JADWIGA MARSZAŁEK")
- address: Adres zamieszkania  
- phone: Numer telefonu (jeśli widoczny)
- email: Adres email (jeśli widoczny)
- licenseNumber: Numer prawa jazdy
- licenseCategory: Kategoria prawa jazdy (np. B, C, D)
- licenseIssuer: Wydawca prawa jazdy (np. Starostwo Powiatowe)
- pesel: Numer PESEL
- birthDate: Data urodzenia (format DD.MM.YYYY)
- issueDate: Data wydania (format DD.MM.YYYY)
- expiryDate: Data ważności (format DD.MM.YYYY)

WAŻNE: 
- Czytaj każdy tekst bardzo dokładnie, litera po literze
- Jeśli jakiegoś pola nie widzisz wyraźnie, zwróć null
- NIE WYMYŚLAJ danych - tylko to co rzeczywiście widzisz
- Zwróć wynik w formacie JSON

Przeanalizuj obraz i zwróć tylko JSON bez dodatkowych komentarzy.`;

    case 'vehicle':
      return `Jesteś ekspertem OCR specjalizującym się w analizie pojazdów. Przeanalizuj załączony obraz pojazdu i wyciągnij następujące informacje:

WYMAGANE POLA (zwróć null jeśli nie widzisz):
- licensePlate: Numer rejestracyjny (skup się głównie na tym)
- make: Marka pojazdu
- model: Model pojazdu  
- year: Rok produkcji
- color: Kolor pojazdu
- vin: Numer VIN (jeśli widoczny)

WAŻNE:
- Skup się głównie na numerze rejestracyjnym
- Czytaj każdy tekst bardzo dokładnie
- Jeśli jakiegoś pola nie widzisz wyraźnie, zwróć null
- NIE WYMYŚLAJ danych
- Zwróć wynik w formacie JSON

Przeanalizuj obraz i zwróć tylko JSON bez dodatkowych komentarzy.`;

    case 'damage':
      return `Jesteś ekspertem w analizie uszkodzeń pojazdów. Przeanalizuj załączony obraz uszkodzeń i opisz:

WYMAGANE POLA:
- damageDescription: Szczegółowy opis uszkodzeń
- affectedParts: Lista uszkodzonych części
- severity: Stopień uszkodzenia (lekki/średni/poważny)
- estimatedCost: Szacunkowy koszt naprawy

WAŻNE:
- Opisz dokładnie co widzisz na zdjęciu
- Bądź konkretny w opisie uszkodzeń
- Zwróć wynik w formacie JSON

Przeanalizuj obraz i zwróć tylko JSON bez dodatkowych komentarzy.`;

    default:
      return 'Przeanalizuj załączony obraz i opisz co widzisz.';
  }
}

function parseGeminiResponse(text, analysisType) {
  console.log(`[Gemini] Parsing response for ${analysisType}:`, text);
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      console.log(`[Gemini] Found JSON:`, jsonStr);
      const parsed = JSON.parse(jsonStr);
      console.log(`[Gemini] Parsed ${analysisType}:`, parsed);
      return parsed;
    }
    
    // Fallback: return raw text
    console.log(`[Gemini] No JSON found, returning raw text for ${analysisType}`);
    return { extractedText: text };
  } catch (error) {
    console.error(`[Gemini] Error parsing response for ${analysisType}:`, error);
    return { extractedText: text };
  }
}

function parseGoogleVisionResponse(textAnnotations, documentText, analysisType) {
  // Extract text from Google Vision response
  const extractedText = documentText || (textAnnotations[0]?.description || '');
  
  console.log(`[Google Cloud Vision] Extracted text for ${analysisType}:`, extractedText);
  
  // Return structured data based on analysis type
  if (analysisType === 'license') {
    return parseLicenseFromText(extractedText);
  } else if (analysisType === 'vehicle') {
    return parseVehicleFromText(extractedText);
  } else if (analysisType === 'damage') {
    return parseDamageFromText(extractedText);
  }
  
  return { extractedText };
}

function parseLicenseFromText(text) {
  // Simple regex patterns for license data
  const patterns = {
    name: /(?:imię|nazwisko|name)[\s:]*([A-ZĄĆĘŁŃÓŚŹŻ\s]+)/i,
    address: /(?:adres|address)[\s:]*([A-ZĄĆĘŁŃÓŚŹŻ0-9\s,.-]+)/i,
    licenseNumber: /(?:nr|numer|number)[\s:]*prawa[\s:]*jazdy[\s:]*([A-Z0-9\s]+)/i,
    pesel: /(?:pesel|PESEL)[\s:]*([0-9\s-]+)/i,
    birthDate: /(?:data|birth)[\s:]*urodzenia[\s:]*([0-9.-]+)/i,
    issueDate: /(?:data|date)[\s:]*wydania[\s:]*([0-9.-]+)/i,
    expiryDate: /(?:data|date)[\s:]*ważności[\s:]*([0-9.-]+)/i
  };
  
  const result = {};
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    result[key] = match ? match[1].trim() : null;
  }
  
  return result;
}

function parseVehicleFromText(text) {
  // Simple regex patterns for vehicle data
  const patterns = {
    licensePlate: /([A-Z]{2,3}\s?[A-Z0-9]{4,5})/,
    make: /(?:marka|make)[\s:]*([A-ZĄĆĘŁŃÓŚŹŻ\s]+)/i,
    model: /(?:model)[\s:]*([A-ZĄĆĘŁŃÓŚŹŻ0-9\s]+)/i,
    year: /(?:rok|year)[\s:]*([0-9]{4})/i,
    color: /(?:kolor|color)[\s:]*([A-ZĄĆĘŁŃÓŚŹŻ\s]+)/i
  };
  
  const result = {};
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    result[key] = match ? match[1].trim() : null;
  }
  
  return result;
}

function parseDamageFromText(text) {
  // Simple damage description parsing
  return {
    damageDescription: text.length > 0 ? text.substring(0, 500) : null,
    affectedParts: text.match(/[A-ZĄĆĘŁŃÓŚŹŻ\s]+/g) || [],
    severity: text.includes('poważny') ? 'poważny' : text.includes('średni') ? 'średni' : 'lekki',
    estimatedCost: null
  };
}

// Funkcje pomocnicze dla analizy zdjęć AI

function buildLicenseAnalysisPrompt() {
  return `Jesteś ekspertem OCR (Optical Character Recognition). Przeanalizuj zdjęcie prawa jazdy bardzo dokładnie i wyciągnij TYLKO te informacje, które są wyraźnie widoczne i czytelne.

INSTRUKCJE OCR:
- Czytaj każdy tekst bardzo dokładnie, litera po literze
- Sprawdź wszystkie sekcje dokumentu
- Jeśli tekst jest nieczytelny, rozmyty lub częściowo zasłonięty - wpisz null
- NIE WYMYŚLAJ żadnych danych

Zwróć wynik w formacie JSON:

{
  "name": "imię i nazwisko (lub null jeśli nieczytelne)",
  "address": "adres zamieszkania (lub null jeśli nieczytelny)", 
  "phone": "numer telefonu (lub null jeśli nieczytelny)",
  "email": "adres email (lub null jeśli nieczytelny)",
  "licenseNumber": "numer prawa jazdy (lub null jeśli nieczytelny)",
  "pesel": "numer PESEL (lub null jeśli nieczytelny)",
  "birthDate": "data urodzenia (lub null jeśli nieczytelna)",
  "issueDate": "data wydania (lub null jeśli nieczytelna)",
  "expiryDate": "data ważności (lub null jeśli nieczytelna)"
}

WAŻNE: Zwróć tylko poprawny JSON bez dodatkowych komentarzy.`;
}

function buildVehicleAnalysisPrompt() {
  return `Jesteś ekspertem OCR (Optical Character Recognition). Przeanalizuj zdjęcie pojazdu bardzo dokładnie i wyciągnij TYLKO te informacje, które są wyraźnie widoczne i czytelne.

INSTRUKCJE OCR dla tablic rejestracyjnych:
- Skup się głównie na numerze rejestracyjnym - to najważniejsze
- Czytaj każdą literę i cyfrę bardzo dokładnie
- Sprawdź czy tablica jest w pełni widoczna i niezasłonięta
- Jeśli tablica jest nieczytelna, rozmyta lub częściowo zasłonięta - wpisz null
- NIE WYMYŚLAJ numerów rejestracyjnych

Zwróć wynik w formacie JSON:

{
  "licensePlate": "numer rejestracyjny (lub null jeśli nieczytelny)",
  "make": "marka pojazdu (lub null jeśli nieczytelna)",
  "model": "model pojazdu (lub null jeśli nieczytelny)", 
  "year": "rok produkcji (lub null jeśli nieczytelny)",
  "color": "kolor pojazdu (lub null jeśli nieczytelny)",
  "vin": "numer VIN (lub null jeśli nieczytelny)"
}

WAŻNE: Zwróć tylko poprawny JSON bez dodatkowych komentarzy.`;
}

function buildDamageAnalysisPrompt() {
  return `Przeanalizuj zdjęcie uszkodzeń pojazdu i opisz TYLKO to, co wyraźnie widzisz na zdjęciu.

WAŻNE: Opisz tylko rzeczywiste uszkodzenia widoczne na zdjęciu. NIE WYMYŚLAJ szczegółów.

Zwróć wynik w formacie JSON:

{
  "damageDescription": "szczegółowy opis rzeczywistych uszkodzeń widocznych na zdjęciu",
  "affectedParts": ["lista rzeczywiście uszkodzonych części widocznych na zdjęciu"],
  "severity": "stopień uszkodzenia (lekki/średni/poważny) na podstawie tego co widzisz",
  "estimatedCost": "szacunkowy koszt naprawy (lub null jeśli nie można oszacować)"
}

Opisz dokładnie jakie części są uszkodzone, jak wyglądają uszkodzenia. Zwróć tylko poprawny JSON bez dodatkowych komentarzy.`;
}

function parseAIResponse(response) {
  try {
    // Spróbuj wyciągnąć JSON z odpowiedzi
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Fallback - zwróć surową odpowiedź
    return { rawResponse: response };
  } catch (error) {
    console.error('Błąd parsowania odpowiedzi AI:', error);
    return { rawResponse: response, error: 'Błąd parsowania JSON' };
  }
}


