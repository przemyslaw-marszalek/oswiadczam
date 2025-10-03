// main.js
// Logika frontendu: formularz, dyktowanie, QR, podgląd, PDF, zapis do API.

// Globalne zmienne

document.addEventListener('DOMContentLoaded', function() {
  const $ = (id) => document.getElementById(id);

  // Obsługa ukrywania banera reklamowego przy przewijaniu (tylko na mobile)
  function initAdBannerScroll() {
    const adBanner = document.querySelector('.ad-banner');
    if (!adBanner) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    function updateAdBanner() {
      // Sprawdź czy jesteśmy na mobile (szerokość <= 768px)
      if (window.innerWidth > 768) {
        // Na desktop - zawsze pokazuj baner
        adBanner.classList.remove('hidden');
        return;
      }

      const currentScrollY = window.scrollY;
      
      // Ukryj baner przy przewijaniu w dół, pokaż przy przewijaniu w górę (tylko na mobile)
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Przewijanie w dół - ukryj baner
        adBanner.classList.add('hidden');
      } else {
        // Przewijanie w górę lub na początku strony - pokaż baner
        adBanner.classList.remove('hidden');
      }
      
      lastScrollY = currentScrollY;
      ticking = false;
    }

    function requestTick() {
      if (!ticking) {
        requestAnimationFrame(updateAdBanner);
        ticking = true;
      }
    }

    // Nasłuchuj przewijania
    window.addEventListener('scroll', requestTick, { passive: true });
    
    // Nasłuchuj zmiany rozmiaru okna (responsive)
    window.addEventListener('resize', requestTick, { passive: true });
  }

  // Inicjalizuj obsługę banera
  initAdBannerScroll();

  // Mapowanie nazw pól na wyświetlane nazwy
  const fieldDisplayNames = {
    driverAName: 'Imię i nazwisko sprawcy',
    driverBName: 'Imię i nazwisko poszkodowanego',
    vehicleAPlate: 'Numer rejestracyjny pojazdu sprawcy',
    vehicleBPlate: 'Numer rejestracyjny pojazdu poszkodowanego',
    location: 'Miejsce zdarzenia',
    datetime: 'Data i godzina zdarzenia',
    incidentDetails: 'Szczegóły zdarzenia',
    driverAEmail: 'E-mail sprawcy',
    driverBEmail: 'E-mail poszkodowanego'
  };

  // Funkcja dodawania klasy error do pola
  function addFieldError(fieldId) {
    const fieldElement = fields[fieldId] || $('driverASignature') || $('driverBSignature');
    if (fieldElement) {
      fieldElement.classList.add('field-error');
      fieldElement.parentElement.classList.add('field-error-container');
    }
  }

  // Funkcja usuwania klasy error z pola
  function removeFieldError(fieldId) {
    const fieldElement = fields[fieldId] || $('driverASignature') || $('driverBSignature');
    if (fieldElement) {
      fieldElement.classList.remove('field-error');
      fieldElement.parentElement.classList.remove('field-error-container');
    }
  }

  // Funkcja usuwania wszystkich błędów walidacji
  function clearAllFieldErrors() {
    document.querySelectorAll('.field-error').forEach(el => {
      el.classList.remove('field-error');
    });
    document.querySelectorAll('.field-error-container').forEach(el => {
      el.classList.remove('field-error-container');
    });
  }

  // Funkcja walidacji z wyświetlaniem nazw pól i zaznaczaniem na czerwono
  function validateRequiredFields() {
    clearAllFieldErrors(); // Usuń poprzednie błędy
    
    const payload = serializeForm();
    const errors = [];
    
    // Sprawdź podstawowe wymagane pola
    const requiredFields = ['driverAName', 'vehicleAPlate', 'location', 'datetime'];
    
    requiredFields.forEach(field => {
      if (!payload[field] || payload[field].trim() === '') {
        errors.push(fieldDisplayNames[field]);
        addFieldError(field);
      }
    });
    
    // Sprawdź podpisy
    if (!hasSignature(driverASignature)) {
      errors.push('Podpis sprawcy kolizji');
      addFieldError('driverASignature');
    }
    
    if (!hasSignature(driverBSignature)) {
      errors.push('Podpis poszkodowanego');
      addFieldError('driverBSignature');
    }
    
    return errors;
  }

  // Funkcja walidacji dla e-maili (dodatkowa)
  function validateEmails() {
    const payload = serializeForm();
    
    if (!payload.driverAEmail && !payload.driverBEmail) {
      return ['Przynajmniej jeden adres e-mail (sprawcy lub poszkodowanego)'];
    }
    
    return [];
  }

  const fields = {
    driverAName: $('driverAName'),
    driverAEmail: $('driverAEmail'),
    driverAAddress: $('driverAAddress'),
    driverALicenseCategory: $('driverALicenseCategory'),
    driverALicenseNumber: $('driverALicenseNumber'),
    driverALicenseIssuer: $('driverALicenseIssuer'),
    vehicleAMake: $('vehicleAMake'),
    vehicleAOwner: $('vehicleAOwner'),
    vehicleAOtherOwner: $('vehicleAOtherOwner'),
    driverAPolicyInfo: $('driverAPolicyInfo'),
    driverAPolicyValidUntil: $('driverAPolicyValidUntil'),
    vehicleAPlate: $('vehicleAPlate'),
    location: $('location'),
    datetime: $('datetime'),
    driverBName: $('driverBName'),
    driverBEmail: $('driverBEmail'),
    driverBAddress: $('driverBAddress'),
    driverBLicenseCategory: $('driverBLicenseCategory'),
    driverBLicenseNumber: $('driverBLicenseNumber'),
    driverBLicenseIssuer: $('driverBLicenseIssuer'),
    vehicleBMake: $('vehicleBMake'),
    vehicleBOwner: $('vehicleBOwner'),
    vehicleBOtherOwner: $('vehicleBOtherOwner'),
    driverBPolicyInfo: $('driverBPolicyInfo'),
    driverBPolicyValidUntil: $('driverBPolicyValidUntil'),
    vehicleBPlate: $('vehicleBPlate'),
    incidentDetails: $('incidentDetails'),
    damageDescriptionVictim: $('damageDescriptionVictim'),
    damageValueVictim: $('damageValueVictim'),
    damageDescriptionPerpetrator: $('damageDescriptionPerpetrator'),
    damageValuePerpetrator: $('damageValuePerpetrator'),
    additionalInfo: $('additionalInfo'),
    victimPhotos: $('victimPhotos'),
    perpetratorPhotos: $('perpetratorPhotos'),
  };

  const previewEl = $('preview');
  const dictateBtn = $('dictateBtn');
  const emailBtn = $('emailBtn');
  const downloadBtn = $('downloadBtn');
  
  // Elementy zatwierdzenia
  const approveBtn = $('approveBtn');
  const approvalStatus = $('approvalStatus');
  
  // Elementy wizarda AI
  const wizardBtn = $('wizardBtn');
  const manualBtn = $('manualBtn');
  const wizardSection = $('wizardSection');
  const statementForm = $('statementForm');
  
  // Elementy kroków wizarda
  const wizardSteps = document.querySelectorAll('.wizard-step');
  const wizardProgress = $('wizardProgress');
  const wizardStepText = $('wizardStepText');
  const wizardPrevBtn = $('wizardPrevBtn');
  const wizardNextBtn = $('wizardNextBtn');
  const wizardFinishBtn = $('wizardFinishBtn');
  const wizardSkipBtn = $('wizardSkipBtn');
  
  // Flaga zatwierdzenia
  let isApproved = false;
  
  // Stan wizarda
  let currentWizardStep = 1;
  const totalWizardSteps = 7;
  let wizardCompleted = false;
  let skippedSteps = new Set(); // Śledzenie pominiętych kroków
  
  // Śledzenie aktywnych analiz AI
  const activeAnalyses = new Set();
  let wizardPhotoUploadsInitialized = false;
  
  // Elementy podpisów
  const driverASignature = $('driverASignature');
  const driverBSignature = $('driverBSignature');
  const clearDriverASignature = $('clearDriverASignature');
  const clearDriverBSignature = $('clearDriverBSignature');
  const driverASignatureStatus = $('driverASignatureStatus');
  const driverBSignatureStatus = $('driverBSignatureStatus');
  
  // Referencje do labeli właścicieli
  const vehicleAOwnerLabel = $('vehicleAOwnerLabel');
  const vehicleBOwnerLabel = $('vehicleBOwnerLabel');
  const speechBanner = $('speechBanner');
  const speechLiveText = $('speechLiveText');
  const aiStatus = $('aiStatus');
  const verifyPolicyBtn = $('verifyPolicyBtn');
  const policyStatus = $('policyStatus');
  const verifyPolicyBBtn = $('verifyPolicyBBtn');
  const policyBStatus = $('policyBStatus');
  const getLocationBtn = $('getLocationBtn');
  const locationStatus = $('locationStatus');
  const dictationText = $('dictationText');
  const dictationContent = $('dictationContent');
  const applyDictationBtn = $('applyDictationBtn');
  const clearDictationBtn = $('clearDictationBtn');
  let recognition = null;

  // Ustaw domyślną datę i godzinę na bieżącą
  function setCurrentDateTime() {
    const now = new Date();
    // Konwertuj na format datetime-local (YYYY-MM-DDTHH:MM)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const datetimeValue = `${year}-${month}-${day}T${hours}:${minutes}`;
    fields.datetime.value = datetimeValue;
  }

  // Ustaw domyślną datę przy ładowaniu strony
  setCurrentDateTime();

  // Inicjalizacja podpisów
  initializeSignatures();
  
  // Inicjalizacja pełnoekranowego podpisywania
  initializeFullscreenSignatures();
  
  // Inicjalizacja przełączników właścicieli
  initializeOwnerToggles();
  
  // Inicjalizacja przycisku zatwierdzenia
  initializeApproval();
  
  // Inicjalizacja wizarda AI
  initializeWizard();
  
  // Event listenery do usuwania błędów walidacji
  function addValidationErrorListeners() {
    const fieldIds = Object.keys(fieldDisplayNames);
    
    fieldIds.forEach(fieldId => {
      const fieldElement = fields[fieldId];
      if (fieldElement) {
        fieldElement.addEventListener('input', () => {
          removeFieldError(fieldId);
        });
      }
    });
    
    // Event listenery dla podpisów
    if (driverASignature) {
      driverASignature.addEventListener('mouseup', () => {
        removeFieldError('driverASignature');
      });
    }
    
    if (driverBSignature) {
      driverBSignature.addEventListener('mouseup', () => {
        removeFieldError('driverBSignature');
      });
    }
  }
  
  // Inicjalizuj event listenery walidacji
  addValidationErrorListeners();
  
  // Ustaw początkowy stan przycisków
  updateButtonStates();
  
  // Ustaw domyślne żółte podświetlenie wszystkich pól
  highlightAllFieldsByDefault();
  
  // Upewnij się, że banner nagrywania jest ukryty na początku
  if (speechBanner) {
    speechBanner.classList.add('hidden');
  }

  // Funkcja inicjalizacji podpisów
  function initializeSignatures() {
    // Inicjalizuj podpis sprawcy
    initializeSignatureCanvas(driverASignature, driverASignatureStatus, 'driverA');
    
    // Inicjalizuj podpis poszkodowanego
    initializeSignatureCanvas(driverBSignature, driverBSignatureStatus, 'driverB');
    
    // Obsługa przycisków czyszczenia
    clearDriverASignature.addEventListener('click', () => {
      clearSignature(driverASignature, driverASignatureStatus);
    });
    
    clearDriverBSignature.addEventListener('click', () => {
      clearSignature(driverBSignature, driverBSignatureStatus);
    });
  }

  // Inicjalizacja pełnoekranowego podpisywania
  function initializeFullscreenSignatures() {
    const fullscreenModal = document.getElementById('fullscreenSignatureModal');
    const fullscreenCanvas = document.getElementById('fullscreenSignatureCanvas');
    const fullscreenTitle = document.getElementById('fullscreenSignatureTitle');
    const fullscreenClearBtn = document.getElementById('fullscreenClearSignature');
    const fullscreenSaveBtn = document.getElementById('fullscreenSaveSignature');
    const fullscreenCloseBtn = document.getElementById('fullscreenCloseSignature');
    
    let currentSignatureId = null;
    let fullscreenCtx = null;
    let isDrawing = false;
    let hasSignature = false;

    // Przyciski "Złóż podpis"
    const fullscreenDriverABtn = document.getElementById('fullscreenDriverASignature');
    const fullscreenDriverBBtn = document.getElementById('fullscreenDriverBSignature');

    fullscreenDriverABtn.addEventListener('click', () => {
      openFullscreenSignature('driverA', 'Podpis sprawcy kolizji');
    });

    fullscreenDriverBBtn.addEventListener('click', () => {
      openFullscreenSignature('driverB', 'Podpis poszkodowanego');
    });

    // Przycisk zamknięcia
    fullscreenCloseBtn.addEventListener('click', () => {
      closeFullscreenSignature();
    });

    // Przycisk wyczyść
    fullscreenClearBtn.addEventListener('click', () => {
      clearFullscreenSignature();
    });

    // Przycisk zapisz
    fullscreenSaveBtn.addEventListener('click', () => {
      saveFullscreenSignature();
    });

    // Zamknij modal po kliknięciu w tło
    fullscreenModal.addEventListener('click', (e) => {
      if (e.target === fullscreenModal) {
        closeFullscreenSignature();
      }
    });

    // Obsługa zmiany orientacji ekranu
    window.addEventListener('orientationchange', () => {
      if (fullscreenModal.style.display === 'block') {
        // Ponownie skalować canvas po zmianie orientacji
        setTimeout(() => {
          const rect = fullscreenCanvas.getBoundingClientRect();
          
          // Zapisz obecny podpis
          const currentImageData = fullscreenCtx.getImageData(0, 0, fullscreenCanvas.width, fullscreenCanvas.height);
          
          // Ustaw nowy rozmiar
          fullscreenCanvas.width = rect.width;
          fullscreenCanvas.height = rect.height;
          
          // Przywróć podpis
          fullscreenCtx.putImageData(currentImageData, 0, 0);
        }, 500); // Opóźnienie dla stabilizacji orientacji
      }
    });

    function openFullscreenSignature(signatureId, title) {
      currentSignatureId = signatureId;
      fullscreenTitle.textContent = title;
      fullscreenModal.style.display = 'block';
      
      // Ustaw rozmiar canvas na pełny ekran
      setTimeout(() => {
        const rect = fullscreenCanvas.getBoundingClientRect();
        fullscreenCanvas.width = rect.width;
        fullscreenCanvas.height = rect.height;
        
        fullscreenCtx = fullscreenCanvas.getContext('2d');
        fullscreenCtx.strokeStyle = '#1f2937';
        fullscreenCtx.lineWidth = 3;
        fullscreenCtx.lineCap = 'round';
        fullscreenCtx.lineJoin = 'round';
        
        // Skopiuj istniejący podpis jeśli istnieje
        const originalCanvas = document.getElementById(signatureId + 'Signature');
        if (originalCanvas && originalCanvas.toDataURL() !== originalCanvas.toDataURL('image/png', 0.1)) {
          const originalCtx = originalCanvas.getContext('2d');
          const imageData = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
          fullscreenCtx.putImageData(imageData, 0, 0);
          hasSignature = true;
        } else {
          hasSignature = false;
        }
        
        setupFullscreenCanvasEvents();
      }, 100);
    }

    function setupFullscreenCanvasEvents() {
      // Obsługa myszy
      fullscreenCanvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const rect = fullscreenCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        fullscreenCtx.beginPath();
        fullscreenCtx.moveTo(x, y);
        hasSignature = true;
      });

      fullscreenCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const rect = fullscreenCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        fullscreenCtx.lineTo(x, y);
        fullscreenCtx.stroke();
      });

      fullscreenCanvas.addEventListener('mouseup', () => {
        isDrawing = false;
      });

      // Obsługa dotyku
      fullscreenCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isDrawing = true;
        const rect = fullscreenCanvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        fullscreenCtx.beginPath();
        fullscreenCtx.moveTo(x, y);
        hasSignature = true;
      });

      fullscreenCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!isDrawing) return;
        const rect = fullscreenCanvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        fullscreenCtx.lineTo(x, y);
        fullscreenCtx.stroke();
      });

      fullscreenCanvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        isDrawing = false;
      });
    }

    function clearFullscreenSignature() {
      fullscreenCtx.clearRect(0, 0, fullscreenCanvas.width, fullscreenCanvas.height);
      hasSignature = false;
    }

    function saveFullscreenSignature() {
      if (!hasSignature) {
        alert('Proszę złożyć podpis przed zapisaniem.');
        return;
      }

      // Skopiuj podpis z pełnoekranowego canvas do oryginalnego
      const originalCanvas = document.getElementById(currentSignatureId + 'Signature');
      const originalCtx = originalCanvas.getContext('2d');
      
      // Wyczyść oryginalny canvas
      originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
      
      // Skaluj i skopiuj podpis - użyj rzeczywistego rozmiaru canvas
      originalCtx.drawImage(fullscreenCanvas, 0, 0, originalCanvas.width, originalCanvas.height);
      
      // Zaktualizuj status
      const statusElement = document.getElementById(currentSignatureId + 'SignatureStatus');
      statusElement.textContent = 'Podpisano';
      statusElement.style.color = '#10b981';
      
      closeFullscreenSignature();
    }

    function closeFullscreenSignature() {
      fullscreenModal.style.display = 'none';
      currentSignatureId = null;
      fullscreenCtx = null;
      isDrawing = false;
      hasSignature = false;
    }
  }

  // Funkcja inicjalizacji canvas do podpisu
  function initializeSignatureCanvas(canvas, statusElement, signatureId) {
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let hasSignature = false;

    // Ustawienia stylu
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Obsługa myszy
    canvas.addEventListener('mousedown', (e) => {
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.beginPath();
      ctx.moveTo(x, y);
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => {
      if (isDrawing) {
        isDrawing = false;
        hasSignature = true;
        updateSignatureStatus(statusElement, true);
      }
    });

    canvas.addEventListener('mouseleave', () => {
      isDrawing = false;
    });

    // Obsługa dotyku (mobile)
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      ctx.beginPath();
      ctx.moveTo(x, y);
    });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (isDrawing) {
        isDrawing = false;
        hasSignature = true;
        updateSignatureStatus(statusElement, true);
      }
    });

    // Funkcja czyszczenia podpisu
    function clearSignature(canvas, statusElement) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasSignature = false;
      updateSignatureStatus(statusElement, false);
    }

    // Funkcja aktualizacji statusu
    function updateSignatureStatus(element, signed) {
      if (signed) {
        element.textContent = '✓ Podpisano';
        element.classList.add('signed');
        // Usuń podświetlenie gdy podpisano
        element.style.backgroundColor = '';
        element.style.borderColor = '';
        element.style.borderWidth = '';
      } else {
        element.textContent = 'Nie podpisano';
        element.classList.remove('signed');
      }
    }

    // Zwróć funkcję sprawdzania podpisu
    return () => hasSignature;
  }

  // Funkcja czyszczenia podpisu
  function clearSignature(canvas, statusElement) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    statusElement.textContent = 'Nie podpisano';
    statusElement.classList.remove('signed');
  }

  // Funkcja sprawdzania czy podpis istnieje
  function hasSignature(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Sprawdź czy są jakieś piksele (nie tylko przezroczyste)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true; // Alpha > 0
    }
    return false;
  }

  // Funkcja inicjalizacji zatwierdzenia
  function initializeApproval() {
    // Upewnij się, że status zatwierdzenia jest ukryty na początku
    approvalStatus.classList.add('hidden');
    console.log('Approval status initialized, hidden:', approvalStatus.classList.contains('hidden'));
    
    approveBtn.addEventListener('click', () => {
      // Walidacja z zaznaczaniem błędów na czerwono
      const validationErrors = validateRequiredFields();
      
      if (validationErrors.length > 0) {
        const errorMessage = `Uzupełnij wymagane pola:\n• ${validationErrors.join('\n• ')}`;
        alert(errorMessage);
        return;
      }
      
      // Zatwierdź
      isApproved = true;
      
      // Automatycznie zapisz oświadczenie po zatwierdzeniu
      saveStatementSilent();
      
      // Ukryj przycisk zatwierdź i pokaż status
      approveBtn.style.display = 'none';
      approvalStatus.classList.remove('hidden');
      
      // Aktywuj przyciski akcji
      emailBtn.disabled = false;
      emailBtn.classList.remove('disabled');
      downloadBtn.disabled = false;
      downloadBtn.classList.remove('disabled');
      
      // Sprawdź stan przycisków po zatwierdzeniu
      updateButtonStates();
      
      // Pokaż inteligentny komunikat
      const driverAEmail = $('driverAEmail').value.trim();
      const driverBEmail = $('driverBEmail').value.trim();
      const hasEmails = driverAEmail || driverBEmail;
      
      if (hasEmails) {
        alert('Oświadczenie zostało zatwierdzone! Możesz teraz wysłać je na e-mail lub pobrać PDF.');
      } else {
        alert('Oświadczenie zostało zatwierdzone! Możesz teraz pobrać PDF. Aby wysłać na e-mail, dodaj przynajmniej jeden adres e-mail.');
      }
    });
  }
  
  // Funkcja walidacji wszystkich kroków wizarda
  function validateAllStepsPhotos() {
    const stepsToValidate = [
      { step: 1, name: 'prawa jazdy sprawcy', required: 2, fileInput: $('licenseAFile') },
      { step: 2, name: 'prawa jazdy poszkodowanego', required: 2, fileInput: $('licenseBFile') },
      { step: 3, name: 'pojazdu poszkodowanego', required: 2, fileInput: $('vehicleBFile') },
      { step: 4, name: 'pojazdu sprawcy', required: 2, fileInput: $('vehicleAFile') },
      { step: 5, name: 'uszkodzeń pojazdu poszkodowanego', required: 1, fileInput: $('damageBFile') },
      { step: 6, name: 'uszkodzeń pojazdu sprawcy', required: 1, fileInput: $('damageAFile') }
    ];
    
    const missingSteps = [];
    
    // Filtruj tylko kroki, które nie zostały pominięte
    const stepsToCheck = stepsToValidate.filter(step => !skippedSteps.has(step.step));
    
    for (const stepInfo of stepsToCheck) {
      let currentPhotos = 0;
      if (stepInfo.fileInput && stepInfo.fileInput.__dataUrls) {
        currentPhotos = stepInfo.fileInput.__dataUrls.length;
      }
      
      if (currentPhotos < stepInfo.required) {
        const missing = stepInfo.required - currentPhotos;
        missingSteps.push(`Krok ${stepInfo.step}: ${missing} zdjęć ${stepInfo.name} (obecnie: ${currentPhotos}/${stepInfo.required})`);
      }
    }
    
    if (missingSteps.length > 0) {
      alert(`❌ Nie można zakończyć wizarda!\n\nBrakuje zdjęć w następujących krokach:\n\n${missingSteps.join('\n')}\n\nDodaj wymagane zdjęcia przed zakończeniem wizarda.`);
      return false;
    }
    
    return true;
  }

  // Funkcja walidacji wymaganej liczby zdjęć dla aktualnego kroku
  function validateCurrentStepPhotos() {
    // Jeśli aktualny krok został pominięty, nie waliduj
    if (skippedSteps.has(currentWizardStep)) {
      console.log('🚨 WIZARD: Step', currentWizardStep, 'was skipped, skipping validation');
      return true;
    }
    
    let requiredPhotos = 0;
    let currentPhotos = 0;
    let stepName = '';
    let fileInput = null;
    
    switch (currentWizardStep) {
      case 1: // Prawo jazdy sprawcy
        requiredPhotos = 2;
        stepName = 'prawa jazdy sprawcy';
        fileInput = $('licenseAFile');
        break;
      case 2: // Prawo jazdy poszkodowanego
        requiredPhotos = 2;
        stepName = 'prawa jazdy poszkodowanego';
        fileInput = $('licenseBFile');
        break;
      case 3: // Pojazd poszkodowanego
        requiredPhotos = 2;
        stepName = 'pojazdu poszkodowanego';
        fileInput = $('vehicleBFile');
        break;
      case 4: // Pojazd sprawcy
        requiredPhotos = 2;
        stepName = 'pojazdu sprawcy';
        fileInput = $('vehicleAFile');
        break;
      case 5: // Uszkodzenia poszkodowanego
        requiredPhotos = 1; // Minimum 1 zdjęcie
        stepName = 'uszkodzeń pojazdu poszkodowanego';
        fileInput = $('damageBFile');
        break;
      case 6: // Uszkodzenia sprawcy
        requiredPhotos = 1; // Minimum 1 zdjęcie
        stepName = 'uszkodzeń pojazdu sprawcy';
        fileInput = $('damageAFile');
        break;
      case 7: // Lokalizacja i szczegóły
        return true; // Ten krok nie wymaga zdjęć
      default:
        return true;
    }
    
    if (fileInput && fileInput.__dataUrls) {
      currentPhotos = fileInput.__dataUrls.length;
    }
    
    if (currentPhotos < requiredPhotos) {
      const missing = requiredPhotos - currentPhotos;
      alert(`❌ Krok ${currentWizardStep}: Wymagane ${requiredPhotos} zdjęć ${stepName}.\n\nObecnie masz: ${currentPhotos} zdjęć\nBrakuje: ${missing} zdjęć\n\nDodaj wymaganą liczbę zdjęć przed przejściem dalej.`);
      return false;
    }
    
    return true;
  }

  // Funkcja inicjalizacji wizarda AI
  function initializeWizard() {
    // Przełączanie między trybami
    wizardBtn.addEventListener('click', () => {
      // Zablokuj ponowne uruchamianie wizarda po zakończeniu
      if (wizardCompleted) {
        alert('Wizard został już zakończony. Nie można go uruchomić ponownie.');
        return;
      }
      
      wizardBtn.classList.add('active');
      manualBtn.classList.remove('active');
      wizardSection.classList.remove('hidden');
      // NIE ukrywaj formularza - powinien być widoczny podczas wypełniania
      // statementForm.style.display = 'none';
      
      // Inicjalizuj wizard tylko raz
      if (!wizardPhotoUploadsInitialized) {
        initializeWizardPhotoUploads();
        initializeWizardGPS();
        initializeWizardMicrophone();
        wizardPhotoUploadsInitialized = true;
      }
      
      // Pokaż pierwszy krok
      showWizardStep(1);
    });
    
    manualBtn.addEventListener('click', () => {
      manualBtn.classList.add('active');
      wizardBtn.classList.remove('active');
      wizardSection.classList.add('hidden');
      statementForm.style.display = 'block';
    });
    
    // Nawigacja wizarda
    wizardNextBtn.addEventListener('click', () => {
      console.log('🚨 WIZARD: Next button clicked, current step:', currentWizardStep);
      if (currentWizardStep < totalWizardSteps && !wizardCompleted) {
        // Sprawdź czy aktualny krok ma wymaganą liczbę zdjęć
        if (!validateCurrentStepPhotos()) {
          return; // Zatrzymaj jeśli walidacja nie przeszła
        }
        
        // Analizuj dane z aktualnego kroku przed przejściem dalej
        console.log('🚨 WIZARD: Calling analyzeCurrentStep before moving to next step');
        analyzeCurrentStep();
        
        currentWizardStep++;
        console.log('🚨 WIZARD: Moving to step:', currentWizardStep);
        updateWizardStep();
      }
    });
    
    wizardPrevBtn.addEventListener('click', () => {
      // Zablokuj całkowicie możliwość cofania się w wizardze
      console.log('🚨 WIZARD: Próba cofnięcia się zablokowana');
      return;
      
      if (currentWizardStep > 1 && !wizardCompleted) {
        currentWizardStep--;
        updateWizardStep();
      }
    });
    
    wizardFinishBtn.addEventListener('click', () => {
      // Sprawdź czy wszystkie kroki mają wymaganą liczbę zdjęć
      if (!validateAllStepsPhotos()) {
        return; // Zatrzymaj jeśli walidacja nie przeszła
      }
      
      // Analizuj ostatni krok (lokalizacja i szczegóły) przed zakończeniem
      console.log('🚨 WIZARD: Calling analyzeCurrentStep before finishing wizard');
      analyzeCurrentStep();
      
      finishWizard();
    });
    
    wizardSkipBtn.addEventListener('click', () => {
      console.log('🚨 WIZARD: Skip button clicked, current step:', currentWizardStep);
      if (currentWizardStep < totalWizardSteps && !wizardCompleted) {
        // Oznacz aktualny krok jako pominięty
        skippedSteps.add(currentWizardStep);
        console.log('🚨 WIZARD: Step', currentWizardStep, 'marked as skipped');
        
        // Przejdź do następnego kroku bez walidacji
        currentWizardStep++;
        updateWizardStep();
      }
    });
    
    // Ustaw domyślną datę i godzinę
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const wizardDateTime = $('wizardDateTime');
    if (wizardDateTime) {
      wizardDateTime.value = localDateTime;
    }
  }
  
  // Funkcja pokazania konkretnego kroku wizarda
  function showWizardStep(stepNumber) {
    currentWizardStep = stepNumber;
    updateWizardStep();
  }
  
  // Funkcja aktualizacji kroku wizarda
  function updateWizardStep() {
    // Ukryj wszystkie kroki
    wizardSteps.forEach(step => step.classList.remove('active'));
    
    // Pokaż aktualny krok
    const currentStep = document.getElementById(`wizardStep${currentWizardStep}`);
    if (currentStep) {
      currentStep.classList.add('active');
    }
    
    // Aktualizuj pasek postępu
    const progressPercent = (currentWizardStep / totalWizardSteps) * 100;
    wizardProgress.style.width = `${progressPercent}%`;
    
    // Aktualizuj tekst kroku
    wizardStepText.textContent = `Krok ${currentWizardStep} z ${totalWizardSteps}`;
    
    // Aktualizuj przyciski
    wizardPrevBtn.disabled = true; // Zawsze wyłączony - nie można cofać się w wizardze
    
    if (currentWizardStep === totalWizardSteps) {
      wizardNextBtn.classList.add('hidden');
      wizardSkipBtn.classList.add('hidden'); // Ukryj przycisk "Pomiń" na ostatnim kroku
      wizardFinishBtn.classList.remove('hidden');
    } else {
      wizardNextBtn.classList.remove('hidden');
      wizardSkipBtn.classList.remove('hidden'); // Pokaż przycisk "Pomiń" na wszystkich innych krokach
      wizardFinishBtn.classList.add('hidden');
    }
  }
  
// Funkcja inicjalizacji uploadu zdjęć w wizardzie
function initializeWizardPhotoUploads() {
  // Krok 1: Prawo jazdy sprawcy
  const licenseAUpload = $('licenseAUpload');
  const licenseAFile = $('licenseAFile');
  const licenseAPreviews = $('licenseAPreviews');
  
  if (licenseAUpload && licenseAFile && licenseAPreviews) {
    // Dodaj event listener na kliknięcie w obszar upload
    licenseAUpload.addEventListener('click', (e) => {
      // Nie blokuj domyślnego zachowania - pozwól na kliknięcie w input
      if (e.target !== licenseAFile) {
        licenseAFile.click();
      }
    });
    
    licenseAFile.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      
      if (!licenseAFile.__dataUrls) {
        licenseAFile.__dataUrls = [];
      }
      
      const totalPhotos = licenseAFile.__dataUrls.length + files.length;
      if (totalPhotos > 2) {
        alert(`Możesz mieć maksymalnie 2 zdjęcia prawa jazdy. Obecnie masz ${licenseAFile.__dataUrls.length}, więc możesz dodać tylko ${2 - licenseAFile.__dataUrls.length} zdjęć.`);
        e.target.value = '';
        return;
      }
      
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          licenseAFile.__dataUrls.push({
            name: file.name,
            dataUrl: dataUrl,
            type: file.type
          });
        } catch (error) {
          console.error('Error converting file to data URL:', error);
        }
      }
      
      updatePhotoPreviews('licenseAPreviews', licenseAFile.__dataUrls);
      
      if (licenseAFile.__dataUrls.length > 0) {
        licenseAUpload.querySelector('.upload-placeholder').classList.add('hidden');
      }
    });
  }
  
  // Krok 2: Prawo jazdy poszkodowanego
  const licenseBUpload = $('licenseBUpload');
  const licenseBFile = $('licenseBFile');
  const licenseBPreviews = $('licenseBPreviews');
  
  console.log('🚨 WIZARD: Initializing step 2 elements:', {
    licenseBUpload: !!licenseBUpload,
    licenseBFile: !!licenseBFile,
    licenseBPreviews: !!licenseBPreviews
  });
  
  if (licenseBUpload && licenseBFile && licenseBPreviews) {
    console.log('🚨 WIZARD: Adding event listener to licenseBFile');
    
    // Dodaj event listener na kliknięcie w obszar upload
    licenseBUpload.addEventListener('click', (e) => {
      // Nie blokuj domyślnego zachowania - pozwól na kliknięcie w input
      if (e.target !== licenseBFile) {
        licenseBFile.click();
      }
    });
    
    // Dodaj event listener bezpośrednio (bez cloneNode dla iOS Chrome)
    licenseBFile.addEventListener('change', async (e) => {
      console.log('🚨 WIZARD: licenseBFile change event triggered');
      const files = Array.from(e.target.files);
      console.log('🚨 WIZARD: Files selected:', files.length);
      
      if (!licenseBFile.__dataUrls) {
        licenseBFile.__dataUrls = [];
      }
      
      const totalPhotos = licenseBFile.__dataUrls.length + files.length;
      if (totalPhotos > 2) {
        alert(`Możesz mieć maksymalnie 2 zdjęcia prawa jazdy. Obecnie masz ${licenseBFile.__dataUrls.length}, więc możesz dodać tylko ${2 - licenseBFile.__dataUrls.length} zdjęć.`);
        e.target.value = '';
        return;
      }
      
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          licenseBFile.__dataUrls.push({
            name: file.name,
            dataUrl: dataUrl,
            type: file.type
          });
        } catch (error) {
          console.error('Error converting file to data URL:', error);
        }
      }
      
      console.log('🚨 WIZARD: Total photos after adding:', licenseBFile.__dataUrls.length);
      console.log('🚨 WIZARD: Calling updatePhotoPreviews');
      updatePhotoPreviews('licenseBPreviews', licenseBFile.__dataUrls);
      
      if (licenseBFile.__dataUrls.length > 0) {
        licenseBUpload.querySelector('.upload-placeholder').classList.add('hidden');
      }
      
      // Dodaj debug dla kroku 2
      console.log('🚨 WIZARD: Step 2 photos added, checking if analysis should trigger');
      console.log('🚨 WIZARD: Current step:', currentWizardStep);
      console.log('🚨 WIZARD: LicenseB dataUrls:', licenseBFile.__dataUrls);
      
      // Usunięto automatyczny trigger - analiza będzie uruchamiana tylko przez przycisk "Dalej"
    });
  }
  
  // Krok 3: Pojazd sprawcy
  const vehicleAUpload = $('vehicleAUpload');
  const vehicleAFile = $('vehicleAFile');
  const vehicleAPreviews = $('vehicleAPreviews');
  
  if (vehicleAUpload && vehicleAFile && vehicleAPreviews) {
    // Dodaj event listener na kliknięcie w obszar upload
    vehicleAUpload.addEventListener('click', (e) => {
      // Nie blokuj domyślnego zachowania - pozwól na kliknięcie w input
      if (e.target !== vehicleAFile) {
        vehicleAFile.click();
      }
    });
    
    vehicleAFile.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      
      if (!vehicleAFile.__dataUrls) {
        vehicleAFile.__dataUrls = [];
      }
      
      const totalPhotos = vehicleAFile.__dataUrls.length + files.length;
      if (totalPhotos > 2) {
        alert(`Możesz mieć maksymalnie 2 zdjęcia pojazdu. Obecnie masz ${vehicleAFile.__dataUrls.length}, więc możesz dodać tylko ${2 - vehicleAFile.__dataUrls.length} zdjęć.`);
        e.target.value = '';
        return;
      }
      
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          vehicleAFile.__dataUrls.push({
            name: file.name,
            dataUrl: dataUrl,
            type: file.type
          });
        } catch (error) {
          console.error('Error converting file to data URL:', error);
        }
      }
      
      updatePhotoPreviews('vehicleAPreviews', vehicleAFile.__dataUrls);
      
      if (vehicleAFile.__dataUrls.length > 0) {
        vehicleAUpload.querySelector('.upload-placeholder').classList.add('hidden');
      }
    });
  }
  
  // Krok 4: Pojazd poszkodowanego
  const vehicleBUpload = $('vehicleBUpload');
  const vehicleBFile = $('vehicleBFile');
  const vehicleBPreviews = $('vehicleBPreviews');
  
  if (vehicleBUpload && vehicleBFile && vehicleBPreviews) {
    // Dodaj event listener na kliknięcie w obszar upload
    vehicleBUpload.addEventListener('click', (e) => {
      // Nie blokuj domyślnego zachowania - pozwól na kliknięcie w input
      if (e.target !== vehicleBFile) {
        vehicleBFile.click();
      }
    });
    
    vehicleBFile.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      
      if (!vehicleBFile.__dataUrls) {
        vehicleBFile.__dataUrls = [];
      }
      
      const totalPhotos = vehicleBFile.__dataUrls.length + files.length;
      if (totalPhotos > 2) {
        alert(`Możesz mieć maksymalnie 2 zdjęcia pojazdu. Obecnie masz ${vehicleBFile.__dataUrls.length}, więc możesz dodać tylko ${2 - vehicleBFile.__dataUrls.length} zdjęć.`);
        e.target.value = '';
        return;
      }
      
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          vehicleBFile.__dataUrls.push({
            name: file.name,
            dataUrl: dataUrl,
            type: file.type
          });
        } catch (error) {
          console.error('Error converting file to data URL:', error);
        }
      }
      
      updatePhotoPreviews('vehicleBPreviews', vehicleBFile.__dataUrls);
      
      if (vehicleBFile.__dataUrls.length > 0) {
        vehicleBUpload.querySelector('.upload-placeholder').classList.add('hidden');
      }
    });
  }
  
  // Krok 5: Uszkodzenia pojazdu poszkodowanego
  const damageBUpload = $('damageBUpload');
  const damageBFile = $('damageBFile');
  const damageBPreviews = $('damageBPreviews');
  
  if (damageBUpload && damageBFile && damageBPreviews) {
    // Dodaj event listener na kliknięcie w obszar upload
    damageBUpload.addEventListener('click', (e) => {
      // Nie blokuj domyślnego zachowania - pozwól na kliknięcie w input
      if (e.target !== damageBFile) {
        damageBFile.click();
      }
    });
    
    damageBFile.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      
      if (!damageBFile.__dataUrls) {
        damageBFile.__dataUrls = [];
      }
      
      const totalPhotos = damageBFile.__dataUrls.length + files.length;
      if (totalPhotos > 5) {
        alert(`Możesz mieć maksymalnie 5 zdjęć uszkodzeń. Obecnie masz ${damageBFile.__dataUrls.length}, więc możesz dodać tylko ${5 - damageBFile.__dataUrls.length} zdjęć.`);
        e.target.value = '';
        return;
      }
      
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          damageBFile.__dataUrls.push({
            name: file.name,
            dataUrl: dataUrl,
            type: file.type
          });
        } catch (error) {
          console.error('Error converting file to data URL:', error);
        }
      }
      
      updatePhotoPreviews('damageBPreviews', damageBFile.__dataUrls);
      
      if (damageBFile.__dataUrls.length > 0) {
        damageBUpload.querySelector('.upload-placeholder').classList.add('hidden');
      }
    });
  }
  
  // Krok 6: Uszkodzenia pojazdu sprawcy
  const damageAUpload = $('damageAUpload');
  const damageAFile = $('damageAFile');
  const damageAPreviews = $('damageAPreviews');
  
  if (damageAUpload && damageAFile && damageAPreviews) {
    // Dodaj event listener na kliknięcie w obszar upload
    damageAUpload.addEventListener('click', (e) => {
      // Nie blokuj domyślnego zachowania - pozwól na kliknięcie w input
      if (e.target !== damageAFile) {
        damageAFile.click();
      }
    });
    
    damageAFile.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      
      if (!damageAFile.__dataUrls) {
        damageAFile.__dataUrls = [];
      }
      
      const totalPhotos = damageAFile.__dataUrls.length + files.length;
      if (totalPhotos > 5) {
        alert(`Możesz mieć maksymalnie 5 zdjęć uszkodzeń. Obecnie masz ${damageAFile.__dataUrls.length}, więc możesz dodać tylko ${5 - damageAFile.__dataUrls.length} zdjęć.`);
        e.target.value = '';
        return;
      }
      
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          damageAFile.__dataUrls.push({
            name: file.name,
            dataUrl: dataUrl,
            type: file.type
          });
        } catch (error) {
          console.error('Error converting file to data URL:', error);
        }
      }
      
      updatePhotoPreviews('damageAPreviews', damageAFile.__dataUrls);
      
      if (damageAFile.__dataUrls.length > 0) {
        damageAUpload.querySelector('.upload-placeholder').classList.add('hidden');
      }
    });
  }
}

// Funkcja inicjalizacji GPS
  function initializeWizardGPS() {
    const gpsBtn = $('wizardGpsBtn');
    const locationInput = $('wizardLocation');
    
    if (gpsBtn && locationInput) {
      gpsBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
          gpsBtn.textContent = '📍 Pobieranie...';
          gpsBtn.disabled = true;
          
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              
              gpsBtn.textContent = '📍 Pobieranie adresu...';
              
              try {
                // Użyj tej samej funkcji co główny formularz
                const address = await reverseGeocode(lat, lng);
                
                if (address) {
                  locationInput.value = address;
                } else {
                  // Fallback do współrzędnych
                  locationInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                }
              } catch (error) {
                console.error('Błąd reverse geocoding:', error);
                // Fallback do współrzędnych
                locationInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              }
              
              gpsBtn.textContent = '📍 Pobierz z GPS';
              gpsBtn.disabled = false;
            },
            (error) => {
              console.error('Location error:', error);
              let message = 'Nie udało się pobrać lokalizacji GPS';
              
              switch (error.code) {
                case error.PERMISSION_DENIED:
                  message = 'Brak uprawnień do lokalizacji. Sprawdź ustawienia przeglądarki.';
                  break;
                case error.POSITION_UNAVAILABLE:
                  message = 'Lokalizacja niedostępna.';
                  break;
                case error.TIMEOUT:
                  message = 'Przekroczono czas oczekiwania na lokalizację.';
                  break;
              }
              
              alert(`❌ ${message}`);
              gpsBtn.textContent = '📍 Pobierz z GPS';
              gpsBtn.disabled = false;
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 300000 // 5 minut
            }
          );
        } else {
          alert('GPS nie jest dostępny w tej przeglądarce');
        }
      });
    }
  }
  
  // Funkcja inicjalizacji mikrofonu
  function initializeWizardMicrophone() {
    const micBtn = $('wizardMicBtn');
    const detailsTextarea = $('wizardDetails');
    let recognition = null;
    let accumulatedTranscript = '';
    let isListening = false;
    
    if (micBtn && detailsTextarea) {
      micBtn.addEventListener('click', () => {
        // Jeśli już nagrywamy, zatrzymaj nagrywanie
        if (isListening && recognition) {
          recognition.stop();
          return;
        }
        
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          recognition = new SpeechRecognition();
          
          recognition.lang = 'pl-PL';
          recognition.interimResults = true; // pokazuj tekst na żywo
          recognition.continuous = true; // nasłuchuj ciągle
          recognition.maxAlternatives = 1;
          
          accumulatedTranscript = '';
          isListening = true;
          
          micBtn.textContent = '⏹️ Zatrzymaj nagrywanie';
          micBtn.disabled = false;
          
          recognition.onresult = (event) => {
            let interimText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              if (res.isFinal) {
                accumulatedTranscript += res[0].transcript + ' ';
              } else {
                interimText += res[0].transcript + ' ';
              }
            }
            
            // Pokaż tekst na żywo w textarea
            const liveText = (accumulatedTranscript + ' ' + interimText).trim();
            detailsTextarea.value = liveText;
          };
          
          recognition.onerror = (event) => {
            alert('Błąd rozpoznawania mowy: ' + event.error);
            micBtn.textContent = '🎤 Nagraj opis';
            micBtn.disabled = false;
            isListening = false;
          };
          
          recognition.onend = () => {
            micBtn.textContent = '🎤 Nagraj opis';
            micBtn.disabled = false;
            isListening = false;
            
            // Ustaw finalny tekst
            if (accumulatedTranscript.trim()) {
              detailsTextarea.value = accumulatedTranscript.trim();
            }
          };
          
          recognition.onstart = () => {
            micBtn.textContent = '⏹️ Zatrzymaj nagrywanie';
            micBtn.disabled = false;
            isListening = true;
          };
          
          recognition.start();
        } else {
          alert('Rozpoznawanie mowy nie jest dostępne w tej przeglądarce');
        }
      });
    }
  }
  
  // Funkcja do sprawdzania stanu przycisków
  function updateButtonStates() {
    const driverAEmail = $('driverAEmail').value.trim();
    const driverBEmail = $('driverBEmail').value.trim();
    
    // Sprawdź czy oba pola e-mail są puste
    const bothEmailsEmpty = !driverAEmail && !driverBEmail;
    
    // Jeśli oba e-maile są puste, wyłącz przycisk "Wyślij na e-mail"
    if (bothEmailsEmpty && isApproved) {
      emailBtn.disabled = true;
      emailBtn.classList.add('disabled');
      emailBtn.title = 'Dodaj przynajmniej jeden adres e-mail (sprawcy lub poszkodowanego)';
    } else if (isApproved) {
      emailBtn.disabled = false;
      emailBtn.classList.remove('disabled');
      emailBtn.title = '';
    }
    
    console.log(`📧 Stan przycisków: e-mail=${!emailBtn.disabled}, oba puste=${bothEmailsEmpty}`);
  }

  // Funkcja do zaznaczania pustych pól na żółto
  function highlightEmptyFields() {
    console.log('🟡 Zaznaczam puste pola na żółto...');
    
    // Lista wszystkich pól formularza do sprawdzenia
    const fieldsToCheck = [
      // Dane sprawcy
      'driverAName', 'driverAAddress', 'driverALicenseNumber', 'driverALicenseCategory', 'driverALicenseIssuer', 'driverAEmail',
      'driverAPolicyInfo', 'driverAPolicyValidUntil',
      // Dane poszkodowanego  
      'driverBName', 'driverBAddress', 'driverBLicenseNumber', 'driverBLicenseCategory', 'driverBLicenseIssuer', 'driverBEmail',
      'driverBPolicyInfo', 'driverBPolicyValidUntil',
      // Pojazd sprawcy
      'vehicleAMake', 'vehicleAModel', 'vehicleALicensePlate', 'vehicleAVin',
      // Pojazd poszkodowanego
      'vehicleBMake', 'vehicleBModel', 'vehicleBLicensePlate', 'vehicleBVin',
      // Lokalizacja i szczegóły
      'location', 'datetime', 'incidentDetails', 'additionalInfo'
    ];
    
    let emptyFieldsCount = 0;
    
    fieldsToCheck.forEach(fieldId => {
      const field = $(fieldId);
      if (field) {
        const value = field.value ? field.value.trim() : '';
        if (!value) {
          // Zaznacz pole na żółto
          field.style.backgroundColor = '#fff3cd';
          field.style.borderColor = '#ffc107';
          field.style.borderWidth = '2px';
          emptyFieldsCount++;
          
          console.log(`🟡 Puste pole: ${fieldId}`);
        } else {
          // Usuń zaznaczenie jeśli pole ma wartość
          field.style.backgroundColor = '';
          field.style.borderColor = '';
          field.style.borderWidth = '';
        }
      }
    });
    
    // Sprawdź podpisy
    const driverASignatureStatus = $('driverASignatureStatus');
    const driverBSignatureStatus = $('driverBSignatureStatus');
    
    if (driverASignatureStatus && !driverASignatureStatus.classList.contains('signed')) {
      driverASignatureStatus.style.backgroundColor = '#fff3cd';
      driverASignatureStatus.style.borderColor = '#ffc107';
      driverASignatureStatus.style.borderWidth = '2px';
      driverASignatureStatus.style.borderRadius = '4px';
      driverASignatureStatus.style.padding = '4px 8px';
      emptyFieldsCount++;
      console.log('🟡 Brak podpisu sprawcy');
    } else if (driverASignatureStatus) {
      driverASignatureStatus.style.backgroundColor = '';
      driverASignatureStatus.style.borderColor = '';
      driverASignatureStatus.style.borderWidth = '';
      driverASignatureStatus.style.borderRadius = '';
      driverASignatureStatus.style.padding = '';
    }
    
    if (driverBSignatureStatus && !driverBSignatureStatus.classList.contains('signed')) {
      driverBSignatureStatus.style.backgroundColor = '#fff3cd';
      driverBSignatureStatus.style.borderColor = '#ffc107';
      driverBSignatureStatus.style.borderWidth = '2px';
      driverBSignatureStatus.style.borderRadius = '4px';
      driverBSignatureStatus.style.padding = '4px 8px';
      emptyFieldsCount++;
      console.log('🟡 Brak podpisu poszkodowanego');
    } else if (driverBSignatureStatus) {
      driverBSignatureStatus.style.backgroundColor = '';
      driverBSignatureStatus.style.borderColor = '';
      driverBSignatureStatus.style.borderWidth = '';
      driverBSignatureStatus.style.borderRadius = '';
      driverBSignatureStatus.style.padding = '';
    }
    
    console.log(`🟡 Zaznaczono ${emptyFieldsCount} pustych pól`);
    return emptyFieldsCount;
  }

  // Funkcja do usuwania zaznaczenia z pola po jego wypełnieniu
  function removeFieldHighlight(fieldId) {
    const field = $(fieldId);
    if (field) {
      field.style.backgroundColor = '';
      field.style.borderColor = '';
      field.style.borderWidth = '';
    }
  }

  // Funkcja do ustawienia domyślnego żółtego podświetlenia wszystkich pól
  function highlightAllFieldsByDefault() {
    const fieldsToHighlight = [
      'driverAName', 'driverAEmail', 'driverAAddress', 'driverALicenseCategory', 
      'driverALicenseNumber', 'driverALicenseIssuer', 'vehicleAMake', 'vehicleAOwner',
      'driverAPolicyInfo', 'driverAPolicyValidUntil', 'vehicleAPlate',
      'location', 'datetime',
      'driverBName', 'driverBEmail', 'driverBAddress', 'driverBLicenseCategory',
      'driverBLicenseNumber', 'driverBLicenseIssuer', 'vehicleBMake', 'vehicleBOwner',
      'driverBPolicyInfo', 'driverBPolicyValidUntil', 'vehicleBPlate',
      'incidentDetails', 'damageDescriptionVictim', 'damageValueVictim', 'damageDescriptionPerpetrator', 'damageValuePerpetrator', 'additionalInfo'
    ];

    fieldsToHighlight.forEach(fieldId => {
      const field = $(fieldId);
      if (field) {
        field.style.backgroundColor = '#fff3cd';
        field.style.borderColor = '#ffc107';
        field.style.borderWidth = '2px';
      }
    });

    // Podświetl pola podpisów jeśli nie są podpisane
    const driverASignatureStatus = $('driverASignatureStatus');
    const driverBSignatureStatus = $('driverBSignatureStatus');
    
    if (driverASignatureStatus && !driverASignatureStatus.classList.contains('signed')) {
      driverASignatureStatus.style.backgroundColor = '#fff3cd';
      driverASignatureStatus.style.borderColor = '#ffc107';
      driverASignatureStatus.style.borderWidth = '2px';
    }
    if (driverBSignatureStatus && !driverBSignatureStatus.classList.contains('signed')) {
      driverBSignatureStatus.style.backgroundColor = '#fff3cd';
      driverBSignatureStatus.style.borderColor = '#ffc107';
      driverBSignatureStatus.style.borderWidth = '2px';
    }
  }

  // Funkcja zakończenia wizarda
  async function finishWizard() {
    console.log('🏁 Kończę wizard - czekam na uzupełnienie wszystkich pól...');
    
    // Pokaż stan ładowania na przycisku
    showWizardLoading();
    
    // Analizuj ostatni krok (lokalizacja i szczegóły) i czekaj na zakończenie
    const stepData = getCurrentStepData();
    if (stepData) {
      console.log(`🔍 Analizuję ostatni krok ${currentWizardStep}:`, stepData);
      await analyzeStepData(stepData, currentWizardStep);
    }
    
    // Czekaj na zakończenie wszystkich aktywnych analiz
    console.log(`⏳ Czekam na zakończenie ${activeAnalyses.size} aktywnych analiz...`);
    while (activeAnalyses.size > 0) {
      console.log(`⏳ Pozostało ${activeAnalyses.size} analiz:`, Array.from(activeAnalyses));
      
      // Aktualizuj tekst przycisku z liczbą pozostałych analiz
      const finishBtn = $('wizardFinishBtn');
      const skipBtn = $('wizardSkipBtn');
      if (finishBtn) {
        finishBtn.textContent = `⏳ Czekam na zakończenie ${activeAnalyses.size} analiz AI...`;
      }
      if (skipBtn) {
        skipBtn.disabled = true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Sprawdź co 500ms
    }
    
    console.log('✅ Wszystkie analizy zakończone!');
    
    // Ukryj stan ładowania na przycisku
    hideWizardLoading();
    
    // Dodatkowe opóźnienie, aby użytkownik zobaczył uzupełnianie pól
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Zaznacz puste pola na żółto
    const emptyFieldsCount = highlightEmptyFields();
    
    // Dodaj event listenery do wszystkich pól, aby usuwały zaznaczenie po wypełnieniu
    const fieldsToCheck = [
      'driverAName', 'driverAAddress', 'driverALicenseNumber', 'driverALicenseCategory', 'driverALicenseIssuer', 'driverAEmail',
      'driverAPolicyInfo', 'driverAPolicyValidUntil',
      'driverBName', 'driverBAddress', 'driverBLicenseNumber', 'driverBLicenseCategory', 'driverBLicenseIssuer', 'driverBEmail',
      'driverBPolicyInfo', 'driverBPolicyValidUntil',
      'vehicleAMake', 'vehicleAModel', 'vehicleALicensePlate', 'vehicleAVin',
      'vehicleBMake', 'vehicleBModel', 'vehicleBLicensePlate', 'vehicleBVin',
      'location', 'datetime', 'incidentDetails', 'additionalInfo'
    ];
    
    fieldsToCheck.forEach(fieldId => {
      const field = $(fieldId);
      if (field) {
        // Usuń zaznaczenie po wprowadzeniu tekstu
        field.addEventListener('input', () => {
          if (field.value && field.value.trim()) {
            removeFieldHighlight(fieldId);
          }
          // Sprawdź stan przycisków po zmianie pola e-mail
          if (fieldId === 'driverAEmail' || fieldId === 'driverBEmail') {
            updateButtonStates();
          }
        });
        
        // Usuń zaznaczenie po kliknięciu w pole
        field.addEventListener('focus', () => {
          removeFieldHighlight(fieldId);
        });
      }
    });
    
    // Przełącz z powrotem na tryb ręczny
    manualBtn.click();
    
    // Wizard zakończony - bez komunikatów
    
    // Oznacz wizard jako zakończony
    wizardCompleted = true;
    
    // Zablokuj wszystkie przyciski wizarda
    wizardPrevBtn.disabled = true;
    wizardNextBtn.disabled = true;
    wizardSkipBtn.disabled = true;
    wizardFinishBtn.disabled = true;
    
    // Zaktualizuj stan przycisków
    updateWizardStep();
    
    // Ukryj przycisk "Pomiń" po zakończeniu wizarda
    wizardSkipBtn.classList.add('hidden');
    
    // Zaktualizuj podgląd oświadczenia
    updatePreview();
  }
  
  // Funkcja zbierania danych z wizarda
  function collectWizardData() {
    const data = {
      licenseA: getMultipleImageData('licenseAPreviews'),
      licenseB: getMultipleImageData('licenseBPreviews'),
      vehicleA: getMultipleImageData('vehicleAPreviews'),
      vehicleB: getMultipleImageData('vehicleBPreviews'),
      damageB: getMultipleImageData('damageBPreviews'),
      damageA: getMultipleImageData('damageAPreviews'),
      location: $('wizardLocation').value,
      datetime: $('wizardDateTime').value,
      details: $('wizardDetails').value
    };
    
    console.log('📊 Zebrane dane z wizarda:', data);
    console.log('📊 licenseA:', data.licenseA ? `${data.licenseA.length} zdjęć` : 'BRAK ZDJĘĆ');
    console.log('📊 licenseB:', data.licenseB ? `${data.licenseB.length} zdjęć` : 'BRAK ZDJĘĆ');
    console.log('📊 vehicleA:', data.vehicleA ? `${data.vehicleA.length} zdjęć` : 'BRAK ZDJĘĆ');
    console.log('📊 vehicleB:', data.vehicleB ? `${data.vehicleB.length} zdjęć` : 'BRAK ZDJĘĆ');
    console.log('📊 damageB:', data.damageB ? `${data.damageB.length} zdjęć` : 'BRAK ZDJĘĆ');
    console.log('📊 damageA:', data.damageA ? `${data.damageA.length} zdjęć` : 'BRAK ZDJĘĆ');
    
    return data;
  }
  
  // Funkcja pobierania danych obrazu
  function getImageData(previewId) {
    const preview = $(previewId);
    if (preview && preview.src && !preview.classList.contains('hidden')) {
      return preview.src;
    }
    return null;
  }
  
  // Funkcja pobierania wielu obrazów
  function getMultipleImageData(previewsId) {
    const container = $(previewsId);
    if (!container) return [];
    
    const images = [];
    const imgElements = container.querySelectorAll('img');
    imgElements.forEach(img => {
      if (img.src) {
        images.push(img.src);
      }
    });
    
    return images;
  }
  
  // Funkcja analizy zdjęć AI
  // Funkcja do analizy aktualnego kroku wizarda
  async function analyzeCurrentStep() {
    console.log('🚨 WIZARD: analyzeCurrentStep called for step:', currentWizardStep);
    const stepData = getCurrentStepData();
    console.log('🚨 WIZARD: stepData from getCurrentStepData:', stepData);
    if (!stepData) {
      console.log('🚨 WIZARD: No stepData, returning early');
      return;
    }
    
    console.log(`🔍 Analizuję krok ${currentWizardStep}:`, stepData);
    
    // Uruchom analizę w tle (bez await) - tylko jeśli nie jest już aktywna
    const analysisId = `step-${currentWizardStep}-${stepData.type}`;
    if (!activeAnalyses.has(analysisId)) {
      analyzeStepData(stepData, currentWizardStep);
    } else {
      console.log(`🚨 WIZARD: Analysis ${analysisId} already active, skipping`);
    }
  }
  
  // Funkcja do pobierania danych z aktualnego kroku
  function getCurrentStepData() {
    console.log('🚨 WIZARD: getCurrentStepData called for step:', currentWizardStep);
    switch (currentWizardStep) {
      case 1: // Prawo jazdy sprawcy
        const licenseAFile = $('licenseAFile');
        console.log('🚨 WIZARD: Step 1 - licenseAFile:', licenseAFile);
        console.log('🚨 WIZARD: Step 1 - licenseAFile.__dataUrls:', licenseAFile ? licenseAFile.__dataUrls : 'no file');
        return licenseAFile && licenseAFile.__dataUrls && licenseAFile.__dataUrls.length > 0 ? 
          { type: 'license', data: licenseAFile.__dataUrls.map(photo => photo.dataUrl), target: 'driverA' } : null;
      
      case 2: // Prawo jazdy poszkodowanego
        const licenseBFile = $('licenseBFile');
        console.log('🚨 WIZARD: Step 2 - licenseBFile:', licenseBFile);
        console.log('🚨 WIZARD: Step 2 - licenseBFile.__dataUrls:', licenseBFile ? licenseBFile.__dataUrls : 'no file');
        return licenseBFile && licenseBFile.__dataUrls && licenseBFile.__dataUrls.length > 0 ? 
          { type: 'license', data: licenseBFile.__dataUrls.map(photo => photo.dataUrl), target: 'driverB' } : null;
      
      case 3: // Pojazd poszkodowanego
        const vehicleBFile = $('vehicleBFile');
        return vehicleBFile && vehicleBFile.__dataUrls && vehicleBFile.__dataUrls.length > 0 ? 
          { type: 'vehicle', data: vehicleBFile.__dataUrls.map(photo => photo.dataUrl), target: 'vehicleB' } : null;
      
      case 4: // Pojazd sprawcy
        const vehicleAFile = $('vehicleAFile');
        return vehicleAFile && vehicleAFile.__dataUrls && vehicleAFile.__dataUrls.length > 0 ? 
          { type: 'vehicle', data: vehicleAFile.__dataUrls.map(photo => photo.dataUrl), target: 'vehicleA' } : null;
      
      case 5: // Uszkodzenia poszkodowanego
        const damageBFile = $('damageBFile');
        return damageBFile && damageBFile.__dataUrls && damageBFile.__dataUrls.length > 0 ? 
          { type: 'damage', data: damageBFile.__dataUrls.map(photo => photo.dataUrl), target: 'damageB' } : null;
      
      case 6: // Uszkodzenia sprawcy
        const damageAFile = $('damageAFile');
        return damageAFile && damageAFile.__dataUrls && damageAFile.__dataUrls.length > 0 ? 
          { type: 'damage', data: damageAFile.__dataUrls.map(photo => photo.dataUrl), target: 'damageA' } : null;
      
      case 7: // Lokalizacja i szczegóły
        return { type: 'location', data: null, target: 'location' };
      
      default:
        return null;
    }
  }
  
  // Funkcja pomocnicza do wypełniania formularza na bieżąco
// Funkcja pomocnicza do przenoszenia zdjęć uszkodzeń
function transferDamagePhotosToField(fieldId, photos, prefix) {
  const field = $(fieldId);
  if (field && photos && photos.length > 0) {
    // Inicjalizuj listę jeśli nie istnieje
    if (!field.__dataUrls) {
      field.__dataUrls = [];
    }
    
    // Dodaj nowe zdjęcia do istniejącej listy
    const newPhotos = photos.map((photo, index) => ({
      name: `${prefix}_${field.__dataUrls.length + index + 1}.jpg`,
      dataUrl: typeof photo === 'string' ? photo : (photo.dataUrl || photo),
      type: 'image/jpeg'
    }));
    
    // Sprawdź limit 5 zdjęć
    const totalPhotos = field.__dataUrls.length + newPhotos.length;
    if (totalPhotos > 5) {
      console.warn(`⚠️ Przekroczono limit 5 zdjęć dla ${fieldId}. Dodano tylko ${5 - field.__dataUrls.length} zdjęć.`);
      const remainingSlots = 5 - field.__dataUrls.length;
      field.__dataUrls.push(...newPhotos.slice(0, remainingSlots));
    } else {
      field.__dataUrls.push(...newPhotos);
    }
    
    console.log(`✅ Dodano zdjęcia do ${fieldId}: ${newPhotos.length} nowych, łącznie: ${field.__dataUrls.length}`);
    
    // Użyj nowej funkcji updatePhotoPreviews
    const previewsId = fieldId + 'Previews';
    updatePhotoPreviews(previewsId, field.__dataUrls);
  }
}

  async function fillFormIncrementally(fieldType, data) {
    if (data && Object.keys(data).length > 0) {
      console.log(`📝 Wypełniam ${fieldType} na bieżąco:`, data);
      
      // Wypełnij odpowiednie pola w zależności od typu
      if (fieldType === 'driverA') {
        if (data.name) await streamFillField('driverAName', data.name, { speed: 30 });
        if (data.address) await streamFillField('driverAAddress', data.address, { speed: 20 });
        if (data.licenseNumber) await streamFillField('driverALicenseNumber', data.licenseNumber, { speed: 40 });
        if (data.licenseCategory) await streamFillField('driverALicenseCategory', data.licenseCategory, { speed: 50 });
        if (data.licenseIssuer) await streamFillField('driverALicenseIssuer', data.licenseIssuer, { speed: 20 });
        if (data.email) await streamFillField('driverAEmail', data.email, { speed: 30 });
        // Sprawdź stan przycisków po wypełnieniu e-maila sprawcy
        if (data.email) updateButtonStates();
        // Aktualizuj podgląd oświadczenia
        updatePreview();
      } else if (fieldType === 'driverB') {
        if (data.name) await streamFillField('driverBName', data.name, { speed: 30 });
        if (data.address) await streamFillField('driverBAddress', data.address, { speed: 20 });
        if (data.licenseNumber) await streamFillField('driverBLicenseNumber', data.licenseNumber, { speed: 40 });
        if (data.licenseCategory) await streamFillField('driverBLicenseCategory', data.licenseCategory, { speed: 50 });
        if (data.licenseIssuer) await streamFillField('driverBLicenseIssuer', data.licenseIssuer, { speed: 20 });
        if (data.email) await streamFillField('driverBEmail', data.email, { speed: 30 });
        // Sprawdź stan przycisków po wypełnieniu e-maila poszkodowanego
        if (data.email) updateButtonStates();
        // Aktualizuj podgląd oświadczenia
        updatePreview();
      } else if (fieldType === 'vehicleA') {
        if (data.licensePlate) {
          await streamFillField('vehicleAPlate', data.licensePlate, { speed: 40 });
          // Automatycznie sprawdź polisę po wypełnieniu numeru rejestracyjnego
          setTimeout(() => {
            console.log('🔍 Automatyczne sprawdzanie polisy sprawcy po AI...');
            verifyPolicy();
          }, 1000); // Opóźnienie 1 sekunda po wypełnieniu pola
        }
        if (data.make) await streamFillField('vehicleAMake', data.make, { speed: 50 });
        if (data.model) await streamFillField('vehicleAModel', data.model, { speed: 50 });
        // Aktualizuj podgląd oświadczenia
        updatePreview();
      } else if (fieldType === 'vehicleB') {
        if (data.licensePlate) {
          await streamFillField('vehicleBPlate', data.licensePlate, { speed: 40 });
          // Automatycznie sprawdź polisę po wypełnieniu numeru rejestracyjnego
          setTimeout(() => {
            console.log('🔍 Automatyczne sprawdzanie polisy poszkodowanego po AI...');
            verifyPolicyB();
          }, 1000); // Opóźnienie 1 sekunda po wypełnieniu pola
        }
        if (data.make) await streamFillField('vehicleBMake', data.make, { speed: 50 });
        if (data.model) await streamFillField('vehicleBModel', data.model, { speed: 50 });
        // Aktualizuj podgląd oświadczenia
        updatePreview();
      } else if (fieldType === 'damageA') {
        if (data.damageDescription) await streamFillField('damageDescriptionPerpetrator', data.damageDescription, { speed: 15 });
        // Wypełnij szacunkową wartość szkody sprawcy z AI
        if (data.estimatedCost) {
          // Wyciągnij liczbę z tekstu (np. "1500 PLN" -> "1500")
          const costMatch = data.estimatedCost.match(/(\d+)/);
          if (costMatch) {
            await streamFillField('damageValuePerpetrator', costMatch[1], { speed: 20 });
          }
        }
        // Przenieś zdjęcia uszkodzeń sprawcy
        if (data.photos && data.photos.length > 0) {
          transferDamagePhotosToField('perpetratorPhotos', data.photos, 'damage_perpetrator');
        }
        // Aktualizuj podgląd oświadczenia
        updatePreview();
      } else if (fieldType === 'damageB') {
        if (data.damageDescription) await streamFillField('damageDescriptionVictim', data.damageDescription, { speed: 15 });
        // Wypełnij szacunkową wartość szkody poszkodowanego z AI
        if (data.estimatedCost) {
          // Wyciągnij liczbę z tekstu (np. "1500 PLN" -> "1500")
          const costMatch = data.estimatedCost.match(/(\d+)/);
          if (costMatch) {
            await streamFillField('damageValueVictim', costMatch[1], { speed: 20 });
          }
        }
        // Przenieś zdjęcia uszkodzeń poszkodowanego
        if (data.photos && data.photos.length > 0) {
          transferDamagePhotosToField('victimPhotos', data.photos, 'damage_victim');
        }
        // Aktualizuj podgląd oświadczenia
        updatePreview();
      }
    }
  }

  // Funkcja do analizy danych kroku (uruchamiana w tle)
  async function analyzeStepData(stepData, stepNumber) {
    const analysisId = `step-${stepNumber}-${stepData.type}`;
    
    try {
      console.log(`🤖 Rozpoczynam analizę kroku ${stepNumber} (${stepData.type})`);
      console.log(`🚨 WIZARD: analyzeStepData called with stepData:`, stepData);
      console.log(`🚨 WIZARD: stepNumber:`, stepNumber);
      activeAnalyses.add(analysisId);
      
      if (stepData.type === 'location') {
        // Przenieś dane lokalizacji bezpośrednio do formularza
        const location = $('wizardLocation').value;
        const datetime = $('wizardDateTime').value;
        const details = $('wizardDetails').value;
        const driverAEmail = $('wizardDriverAEmail').value;
        const driverBEmail = $('wizardDriverBEmail').value;
        
        // Dla danych z wizarda używaj bezpośredniego wstawienia (bez streaming)
        if (location) {
          $('location').value = location;
          console.log(`✅ Przeniesiono lokalizację z wizarda: "${location}"`);
        }
        if (datetime) {
          $('datetime').value = datetime;
          console.log(`✅ Przeniesiono datę z wizarda: "${datetime}"`);
        }
        if (details) {
          $('incidentDetails').value = details;
          console.log(`✅ Przeniesiono szczegóły z wizarda: "${details}"`);
        }
        if (driverAEmail) {
          $('driverAEmail').value = driverAEmail;
          console.log(`✅ Przeniesiono email sprawcy z wizarda: "${driverAEmail}"`);
        }
        if (driverBEmail) {
          $('driverBEmail').value = driverBEmail;
          console.log(`✅ Przeniesiono email poszkodowanego z wizarda: "${driverBEmail}"`);
        }
        
        // Sprawdź stan przycisków po przeniesieniu e-maili z wizarda
        if (driverAEmail || driverBEmail) updateButtonStates();
        
        console.log(`✅ Przeniesiono dane lokalizacji i e-maili z kroku ${stepNumber}`);
        return;
      }
      
      // Analiza obrazów
      const response = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: stepData.data,
          analysisType: stepData.type
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Analiza kroku ${stepNumber} zakończona:`, result.analysis);
        
        // Wypełnij formularz bez focus
        // Dla uszkodzeń dodaj zdjęcia do analizy
        if (stepData.type === 'damage' && stepData.data && stepData.data.length > 0) {
          result.analysis.photos = stepData.data.map(dataUrl => ({
            dataUrl: dataUrl,
            name: `damage_${stepData.target}_${Date.now()}.jpg`,
            type: 'image/jpeg'
          }));
        }
        await fillFormIncrementally(stepData.target, result.analysis);
        
      } else {
        console.log(`❌ Błąd analizy kroku ${stepNumber}:`, response.status);
      }
      
    } catch (error) {
      console.error(`❌ Błąd analizy kroku ${stepNumber}:`, error);
    } finally {
      // Usuń analizę z listy aktywnych
      activeAnalyses.delete(analysisId);
      console.log(`🏁 Analiza ${analysisId} zakończona. Pozostałe: ${activeAnalyses.size}`);
    }
  }

  // Funkcja do analizy zdjęć z wizarda (stara funkcja - do usunięcia)
  async function analyzeWizardImages(wizardData) {
    console.log('🤖 Rozpoczynam analizę zdjęć AI...', wizardData);
    
    const results = {
      driverA: {},
      driverB: {},
      vehicleA: {},
      vehicleB: {},
      damageA: {},
      damageB: {}
    };


    
    // Analizuj prawo jazdy sprawcy
    // Analizuj prawo jazdy sprawcy (przód i tył)
    if (wizardData.licenseA && wizardData.licenseA.length > 0) {
      console.log('📄 Analizuję prawo jazdy sprawcy...');
      try {
        // Wyślij wszystkie zdjęcia prawa jazdy sprawcy
        const response = await fetch('/api/ai/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: wizardData.licenseA,
            analysisType: 'license'
          })
        });
        
        console.log('📄 Odpowiedź AI dla prawa jazdy sprawcy:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('📄 Wynik analizy prawa jazdy sprawcy:', result);
          results.driverA = result.analysis;
          
          // Wypełnij formularz na bieżąco
          fillFormIncrementally('driverA', result.analysis);
        } else {
          const errorText = await response.text();
          console.error('📄 Błąd analizy prawa jazdy sprawcy:', errorText);
        }
      } catch (error) {
        console.error('📄 Błąd analizy prawa jazdy sprawcy:', error);
      }
    }
    
    // Analizuj prawo jazdy poszkodowanego (przód i tył)
    if (wizardData.licenseB && wizardData.licenseB.length > 0) {
      console.log('📄 Analizuję prawo jazdy poszkodowanego...');
      try {
        const response = await fetch('/api/ai/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: wizardData.licenseB,
            analysisType: 'license'
          })
        });
        
        console.log('📄 Odpowiedź AI dla prawa jazdy poszkodowanego:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('📄 Wynik analizy prawa jazdy poszkodowanego:', result);
          results.driverB = result.analysis;
          
          // Wypełnij formularz na bieżąco
          fillFormIncrementally('driverB', result.analysis);
        } else {
          const errorText = await response.text();
          console.error('📄 Błąd analizy prawa jazdy poszkodowanego:', errorText);
        }
      } catch (error) {
        console.error('📄 Błąd analizy prawa jazdy poszkodowanego:', error);
      }
    }
    
    // Analizuj pojazd sprawcy (przód i tył)
    if (wizardData.vehicleA && wizardData.vehicleA.length > 0) {
      console.log('🚗 Analizuję pojazd sprawcy...');
      try {
        const response = await fetch('/api/ai/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: wizardData.vehicleA,
            analysisType: 'vehicle'
          })
        });
        
        console.log('🚗 Odpowiedź AI dla pojazdu sprawcy:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('🚗 Wynik analizy pojazdu sprawcy:', result);
          results.vehicleA = result.analysis;
          
          // Wypełnij formularz na bieżąco
          fillFormIncrementally('vehicleA', result.analysis);
        } else {
          const errorText = await response.text();
          console.error('🚗 Błąd analizy pojazdu sprawcy:', errorText);
        }
      } catch (error) {
        console.error('🚗 Błąd analizy pojazdu sprawcy:', error);
      }
    }
    
    // Analizuj pojazd poszkodowanego (przód i tył)
    if (wizardData.vehicleB && wizardData.vehicleB.length > 0) {
      console.log('🚗 Analizuję pojazd poszkodowanego...');
      try {
        const response = await fetch('/api/ai/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: wizardData.vehicleB,
            analysisType: 'vehicle'
          })
        });
        
        console.log('🚗 Odpowiedź AI dla pojazdu poszkodowanego:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('🚗 Wynik analizy pojazdu poszkodowanego:', result);
          results.vehicleB = result.analysis;
          
          // Wypełnij formularz na bieżąco
          fillFormIncrementally('vehicleB', result.analysis);
        } else {
          const errorText = await response.text();
          console.error('🚗 Błąd analizy pojazdu poszkodowanego:', errorText);
        }
      } catch (error) {
        console.error('🚗 Błąd analizy pojazdu poszkodowanego:', error);
      }
    }
    
    // Analizuj uszkodzenia pojazdu poszkodowanego
    if (wizardData.damageB && wizardData.damageB.length > 0) {
      console.log('🔧 Analizuję uszkodzenia pojazdu poszkodowanego...');
      try {
        const response = await fetch('/api/ai/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: wizardData.damageB,
            analysisType: 'damage'
          })
        });
        
        console.log('🔧 Odpowiedź AI dla uszkodzeń poszkodowanego:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('🔧 Wynik analizy uszkodzeń poszkodowanego:', result);
          results.damageB = result.analysis;
          // Dodaj zdjęcia do wyniku
          results.damageB.photos = wizardData.damageB;
          
          // Wypełnij formularz na bieżąco
          fillFormIncrementally('damageB', result.analysis);
        } else {
          const errorText = await response.text();
          console.error('🔧 Błąd analizy uszkodzeń poszkodowanego:', errorText);
        }
      } catch (error) {
        console.error('🔧 Błąd analizy uszkodzeń poszkodowanego:', error);
      }
    }
    
    // Analizuj uszkodzenia pojazdu sprawcy
    if (wizardData.damageA && wizardData.damageA.length > 0) {
      console.log('🔧 Analizuję uszkodzenia pojazdu sprawcy...');
      try {
        const response = await fetch('/api/ai/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: wizardData.damageA,
            analysisType: 'damage'
          })
        });
        
        console.log('🔧 Odpowiedź AI dla uszkodzeń sprawcy:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('🔧 Wynik analizy uszkodzeń sprawcy:', result);
          results.damageA = result.analysis;
          // Dodaj zdjęcia do wyniku
          results.damageA.photos = wizardData.damageA;
          
          // Wypełnij formularz na bieżąco
          fillFormIncrementally('damageA', result.analysis);
        } else {
          const errorText = await response.text();
          console.error('🔧 Błąd analizy uszkodzeń sprawcy:', errorText);
        }
      } catch (error) {
        console.error('🔧 Błąd analizy uszkodzeń sprawcy:', error);
      }
    }
    
    console.log('🤖 Zakończono analizę AI. Wyniki:', results);
    return results;
  }
  
  // Funkcja streamingowego wypełniania pola tekstowego
async function streamFillField(elementId, text, options = {}) {
  const element = $(elementId);
  if (!element || !text) return;

  const {
    speed = 50, // ms między znakami
    focus = false, // wyłączony focus - analiza w tle
    highlight = true // czy podświetlić pole podczas wypełniania
  } = options;

  // Podświetlenie bez focus (analiza w tle)
  if (highlight) {
    element.style.backgroundColor = '#fff3cd';
    element.style.borderColor = '#ffc107';
  }

  // Wyczyść pole
  element.value = '';

  // Sprawdź czy to pole datetime-local - wymaga pełnej wartości naraz
  if (element.type === 'datetime-local') {
    // Dla pól datetime-local wypełnij całą wartość naraz
    element.value = text;
    console.log(`✅ Wypełniono pole datetime ${elementId}: "${text}"`);
  } else {
    // Dla innych pól wypełnij tekst znak po znaku
    for (let i = 0; i < text.length; i++) {
      element.value += text[i];
      await new Promise(resolve => setTimeout(resolve, speed));
    }
    console.log(`✅ Wypełniono pole ${elementId}: "${text}"`);
  }

  // Usuń podświetlenie
  if (highlight) {
    setTimeout(() => {
      element.style.backgroundColor = '';
      element.style.borderColor = '';
    }, 1000);
  }
}

  // Funkcja wypełniania formularza na podstawie AI
  async function fillFormFromAI(analysisResults) {
    console.log('📝 Wypełniam formularz na podstawie AI:', analysisResults);
    console.log('📝 Typ danych:', typeof analysisResults);
    console.log('📝 Klucze:', Object.keys(analysisResults || {}));
    
    // Sprawdź czy formularz jest widoczny
    const statementForm = $('statementForm');
    console.log('📝 Formularz istnieje:', statementForm ? 'TAK' : 'NIE');
    console.log('📝 Formularz widoczny:', statementForm && !statementForm.classList.contains('hidden') ? 'TAK' : 'NIE');
    
    let filledFields = 0;
    
    // Wypełnij dane sprawcy
    if (analysisResults.driverA.name && analysisResults.driverA.name !== null) {
      await streamFillField('driverAName', analysisResults.driverA.name, { speed: 30 });
      filledFields++;
    }
    if (analysisResults.driverA.address && analysisResults.driverA.address !== null) {
      await streamFillField('driverAAddress', analysisResults.driverA.address, { speed: 20 });
      filledFields++;
    }

    // Wypełnij numer prawa jazdy sprawcy
    if (analysisResults.driverA.licenseNumber && analysisResults.driverA.licenseNumber !== null) {
      await streamFillField('driverALicenseNumber', analysisResults.driverA.licenseNumber, { speed: 40 });
      filledFields++;
    }

    // Wypełnij kategorię prawa jazdy sprawcy
    if (analysisResults.driverA.licenseCategory && analysisResults.driverA.licenseCategory !== null) {
      await streamFillField('driverALicenseCategory', analysisResults.driverA.licenseCategory, { speed: 50 });
      filledFields++;
    }

    // Wypełnij wydawcę prawa jazdy sprawcy
    if (analysisResults.driverA.licenseIssuer && analysisResults.driverA.licenseIssuer !== null) {
      await streamFillField('driverALicenseIssuer', analysisResults.driverA.licenseIssuer, { speed: 20 });
      filledFields++;
    }

    if (analysisResults.driverA.email && analysisResults.driverA.email !== null) {
      await streamFillField('driverAEmail', analysisResults.driverA.email, { speed: 30 });
      filledFields++;
    }
    
    // Wypełnij dane poszkodowanego
    if (analysisResults.driverB.name && analysisResults.driverB.name !== null) {
      await streamFillField('driverBName', analysisResults.driverB.name, { speed: 30 });
      filledFields++;
    }
    if (analysisResults.driverB.address && analysisResults.driverB.address !== null) {
      await streamFillField('driverBAddress', analysisResults.driverB.address, { speed: 20 });
      filledFields++;
    }

    // Wypełnij numer prawa jazdy poszkodowanego
    if (analysisResults.driverB.licenseNumber && analysisResults.driverB.licenseNumber !== null) {
      await streamFillField('driverBLicenseNumber', analysisResults.driverB.licenseNumber, { speed: 40 });
      filledFields++;
    }

    // Wypełnij kategorię prawa jazdy poszkodowanego
    if (analysisResults.driverB.licenseCategory && analysisResults.driverB.licenseCategory !== null) {
      await streamFillField('driverBLicenseCategory', analysisResults.driverB.licenseCategory, { speed: 50 });
      filledFields++;
    }

    // Wypełnij wydawcę prawa jazdy poszkodowanego
    if (analysisResults.driverB.licenseIssuer && analysisResults.driverB.licenseIssuer !== null) {
      await streamFillField('driverBLicenseIssuer', analysisResults.driverB.licenseIssuer, { speed: 20 });
      filledFields++;
    }

    if (analysisResults.driverB.email && analysisResults.driverB.email !== null) {
      await streamFillField('driverBEmail', analysisResults.driverB.email, { speed: 30 });
      filledFields++;
    }
    
    // Wypełnij dane pojazdu sprawcy
    if (analysisResults.vehicleA.licensePlate && analysisResults.vehicleA.licensePlate !== null) {
      await streamFillField('vehicleAPlate', analysisResults.vehicleA.licensePlate, { speed: 40 });
      filledFields++;
    }
    if (analysisResults.vehicleA.make && analysisResults.vehicleA.make !== null) {
      await streamFillField('vehicleAMake', analysisResults.vehicleA.make, { speed: 50 });
      filledFields++;
    }
    if (analysisResults.vehicleA.model && analysisResults.vehicleA.model !== null) {
      await streamFillField('vehicleAModel', analysisResults.vehicleA.model, { speed: 50 });
      filledFields++;
    }

    // Wypełnij dane pojazdu poszkodowanego
    if (analysisResults.vehicleB.licensePlate && analysisResults.vehicleB.licensePlate !== null) {
      await streamFillField('vehicleBPlate', analysisResults.vehicleB.licensePlate, { speed: 40 });
      filledFields++;
    }
    if (analysisResults.vehicleB.make && analysisResults.vehicleB.make !== null) {
      await streamFillField('vehicleBMake', analysisResults.vehicleB.make, { speed: 50 });
      filledFields++;
    }
    if (analysisResults.vehicleB.model && analysisResults.vehicleB.model !== null) {
      await streamFillField('vehicleBModel', analysisResults.vehicleB.model, { speed: 50 });
      filledFields++;
    }
    
    // Wypełnij opis uszkodzeń poszkodowanego
    if (analysisResults.damageB && analysisResults.damageB.damageDescription && analysisResults.damageB.damageDescription !== null) {
      await streamFillField('damageDescriptionVictim', analysisResults.damageB.damageDescription, { speed: 15 });
      filledFields++;
    }

    // Wypełnij opis uszkodzeń sprawcy
    if (analysisResults.damageA && analysisResults.damageA.damageDescription && analysisResults.damageA.damageDescription !== null) {
      await streamFillField('damageDescriptionPerpetrator', analysisResults.damageA.damageDescription, { speed: 15 });
      filledFields++;
    }
    
    console.log(`📝 Wypełniono ${filledFields} pól formularza`);
    
    // Zdjęcia uszkodzeń już zostały przeniesione na bieżąco podczas analizy
    // transferDamagePhotosFromWizard(analysisResults);
    
    // Aktualizuj podgląd
    updatePreview();
  }
  
  // Funkcja wypełniania formularza na podstawie danych z wizarda
  async function fillFormFromWizardData(wizardData) {
    console.log('📝 Wypełniam formularz na podstawie danych z wizarda:', wizardData);
    
    let filledFields = 0;
    
    // Wypełnij lokalizację zdarzenia
    if (wizardData.location && wizardData.location.trim()) {
      await streamFillField('location', wizardData.location.trim(), { speed: 20 });
      filledFields++;
    }
    
    // Wypełnij datę i godzinę zdarzenia
    if (wizardData.datetime && wizardData.datetime.trim()) {
      await streamFillField('datetime', wizardData.datetime.trim(), { speed: 30 });
      filledFields++;
    }
    
    // Wypełnij szczegóły zdarzenia
    if (wizardData.details && wizardData.details.trim()) {
      await streamFillField('incidentDetails', wizardData.details.trim(), { speed: 15 });
      filledFields++;
    }
    
    console.log(`📝 Wypełniono ${filledFields} pól z wizarda`);
    
    // Aktualizuj podgląd
    updatePreview();
  }

// Funkcja przenoszenia zdjęć uszkodzeń z wizarda do formularza
function transferDamagePhotosFromWizard(analysisResults) {
  console.log('📸 Przenoszę zdjęcia uszkodzeń z wizarda do formularza...');

  // Przenieś zdjęcia uszkodzeń poszkodowanego (damageB)
  if (analysisResults.damageB && analysisResults.damageB.photos && analysisResults.damageB.photos.length > 0) {
    transferDamagePhotosToField('victimPhotos', analysisResults.damageB.photos, 'damage_victim');
  }

  // Przenieś zdjęcia uszkodzeń sprawcy (damageA)
  if (analysisResults.damageA && analysisResults.damageA.photos && analysisResults.damageA.photos.length > 0) {
    transferDamagePhotosToField('perpetratorPhotos', analysisResults.damageA.photos, 'damage_perpetrator');
  }
  
  // Aktualizuj podgląd po przeniesieniu zdjęć
  updatePreview();
}
  function showWizardLoading() {
    const finishBtn = $('wizardFinishBtn');
    const skipBtn = $('wizardSkipBtn');
    finishBtn.textContent = '⏳ Czekam na zakończenie analiz AI...';
    finishBtn.disabled = true;
    skipBtn.disabled = true;
  }
  
  function hideWizardLoading() {
    const finishBtn = $('wizardFinishBtn');
    const skipBtn = $('wizardSkipBtn');
    finishBtn.textContent = '✅ Zakończ i wypełnij formularz';
    finishBtn.disabled = false;
    skipBtn.disabled = false;
  }
  
  // Funkcja inicjalizacji przełączników właścicieli
  function initializeOwnerToggles() {
    // Obsługa przełącznika dla sprawcy
    fields.vehicleAOtherOwner.addEventListener('change', (e) => {
      if (e.target.checked) {
        vehicleAOwnerLabel.classList.remove('hidden');
        fields.vehicleAOwner.focus();
      } else {
        vehicleAOwnerLabel.classList.add('hidden');
        // Automatycznie wypełnij imieniem i nazwiskiem sprawcy
        fields.vehicleAOwner.value = fields.driverAName.value;
      }
    });

    // Obsługa przełącznika dla poszkodowanego
    fields.vehicleBOtherOwner.addEventListener('change', (e) => {
      if (e.target.checked) {
        vehicleBOwnerLabel.classList.remove('hidden');
        fields.vehicleBOwner.focus();
      } else {
        vehicleBOwnerLabel.classList.add('hidden');
        // Automatycznie wypełnij imieniem i nazwiskiem poszkodowanego
        fields.vehicleBOwner.value = fields.driverBName.value;
      }
    });
    
    // Inicjalizacja - jeśli checkboxy nie są zaznaczone, wypełnij pola automatycznie
    if (!fields.vehicleAOtherOwner.checked) {
      fields.vehicleAOwner.value = fields.driverAName.value;
    }
    if (!fields.vehicleBOtherOwner.checked) {
      fields.vehicleBOwner.value = fields.driverBName.value;
    }
    
    // Automatyczne aktualizowanie pól "Należy do" gdy zmienia się imię i nazwisko kierowcy
    fields.driverAName.addEventListener('input', () => {
      if (!fields.vehicleAOtherOwner.checked) {
        fields.vehicleAOwner.value = fields.driverAName.value;
      }
    });
    
    fields.driverBName.addEventListener('input', () => {
      if (!fields.vehicleBOtherOwner.checked) {
        fields.vehicleBOwner.value = fields.driverBName.value;
      }
    });
  }

  // Weryfikacja polisy OC
  async function verifyPolicy() {
    const plateNumber = fields.vehicleAPlate.value.trim();
    if (!plateNumber) {
      setPolicyStatus('error', 'Wprowadź numer rejestracyjny');
      return;
    }

    setPolicyStatus('loading', 'Sprawdzanie polisy...');
    verifyPolicyBtn.disabled = true;

    try {
      const response = await fetch('/api/policy/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plateNumber })
      });

      const data = await response.json();

      if (data.ok && data.valid) {
        setPolicyStatus('valid', `✅ ${data.message}<br>Polisa: ${data.policyNumber}<br>Ubezpieczyciel: ${data.insurer}<br>Wazna do: ${data.validUntil}`);
        
        // Automatycznie uzupełnij pola polisy
        fields.driverAPolicyInfo.value = `${data.insurer}, ${data.policyNumber}`;
        fields.driverAPolicyValidUntil.value = data.validUntil;
        
        // Usuń żółte zaznaczenie z pól polisy
        removeFieldHighlight('driverAPolicyInfo');
        removeFieldHighlight('driverAPolicyValidUntil');
      } else {
        setPolicyStatus('invalid', `❌ ${data.message}`);
      }
    } catch (error) {
      console.error('Policy verification error:', error);
      setPolicyStatus('error', 'Błąd podczas weryfikacji polisy');
    } finally {
      verifyPolicyBtn.disabled = false;
    }
  }

  // Weryfikacja polisy OC dla poszkodowanego
  async function verifyPolicyB() {
    const plateNumber = fields.vehicleBPlate.value.trim();
    if (!plateNumber) {
      setPolicyBStatus('error', 'Wprowadź numer rejestracyjny');
      return;
    }

    setPolicyBStatus('loading', 'Sprawdzanie polisy...');
    verifyPolicyBBtn.disabled = true;

    try {
      const response = await fetch('/api/policy/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plateNumber })
      });

      const data = await response.json();

      if (data.ok && data.valid) {
        setPolicyBStatus('valid', `✅ ${data.message}<br>Polisa: ${data.policyNumber}<br>Ubezpieczyciel: ${data.insurer}<br>Wazna do: ${data.validUntil}`);
        
        // Automatycznie uzupełnij pola polisy
        fields.driverBPolicyInfo.value = `${data.insurer}, ${data.policyNumber}`;
        fields.driverBPolicyValidUntil.value = data.validUntil;
        
        // Usuń żółte zaznaczenie z pól polisy
        removeFieldHighlight('driverBPolicyInfo');
        removeFieldHighlight('driverBPolicyValidUntil');
      } else {
        setPolicyBStatus('invalid', `❌ ${data.message}`);
      }
    } catch (error) {
      console.error('Policy verification error:', error);
      setPolicyBStatus('error', 'Błąd podczas weryfikacji polisy');
    } finally {
      verifyPolicyBBtn.disabled = false;
    }
  }

  function setPolicyStatus(type, message) {
    policyStatus.className = `policy-status ${type}`;
    policyStatus.innerHTML = message;
    policyStatus.classList.remove('hidden');
  }

  function setPolicyBStatus(type, message) {
    policyBStatus.className = `policy-status ${type}`;
    policyBStatus.innerHTML = message;
    policyBStatus.classList.remove('hidden');
  }

  // Pobieranie lokalizacji GPS
  async function getCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('error', 'Przeglądarka nie obsługuje geolokalizacji');
      return;
    }

    setLocationStatus('loading', 'Pobieranie lokalizacji...');
    getLocationBtn.disabled = true;

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minut
        });
      });

      const { latitude, longitude } = position.coords;
      
      // Pobierz adres z koordinatów (reverse geocoding)
      const address = await reverseGeocode(latitude, longitude);
      
      if (address) {
        fields.location.value = address;
        setLocationStatus('success', `✅ Lokalizacja pobrana: ${address}`);
      } else {
        fields.location.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        setLocationStatus('success', `✅ Współrzędne pobrane: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      }
    } catch (error) {
      console.error('Location error:', error);
      let message = 'Błąd podczas pobierania lokalizacji';
      
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = 'Brak uprawnień do lokalizacji. Sprawdź ustawienia przeglądarki.';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'Lokalizacja niedostępna.';
          break;
        case error.TIMEOUT:
          message = 'Przekroczono czas oczekiwania na lokalizację.';
          break;
      }
      
      setLocationStatus('error', `❌ ${message}`);
    } finally {
      getLocationBtn.disabled = false;
    }
  }

  async function reverseGeocode(lat, lng) {
    try {
      // Użyj darmowego API Nominatim (OpenStreetMap)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'WypadekApp/1.0'
          }
        }
      );
      
      const data = await response.json();
      
      if (data && data.display_name) {
        // Formatuj adres w bardziej czytelny sposób
        const address = data.display_name.split(',').slice(0, 3).join(', ').trim();
        return address;
      }
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
    }
    
    return null;
  }

  function setLocationStatus(type, message) {
    locationStatus.className = `location-status ${type}`;
    locationStatus.innerHTML = message;
    locationStatus.classList.remove('hidden');
  }
  let isListening = false;
  let accumulatedTranscript = '';
  let hasDictated = false;

  const qrModal = $('qrModal');
  const qrSubmit = $('qrSubmit');
  const qrClose = $('qrClose');
  const qrTokenInput = $('qrTokenInput');
  const manualModal = $('manualModal');
  const manualText = $('manualText');
  const manualAnalyze = $('manualAnalyze');
  const manualClose = $('manualClose');
  const recordModal = $('recordModal');
  const recStart = $('recStart');
  const recStop = $('recStop');
  const recSend = $('recSend');
  const recClose = $('recClose');
  const recPreview = $('recPreview');
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedBlob = null;

  // Funkcja do aktualizacji podglądu zdjęć
  function updatePhotoPreviews(containerId, photos) {
    const container = $(containerId);
    if (!container) {
      console.error(`❌ Container ${containerId} not found!`);
      return;
    }
    
    // Wyczyść kontener
    container.innerHTML = '';
    
    if (!photos || photos.length === 0) {
      container.innerHTML = '<div class="no-photos">Brak zdjęć</div>';
      // Włącz przycisk gdy brak zdjęć
      enableFileInput(containerId);
      return;
    }
    
    // Sprawdź czy osiągnięto maksymalną liczbę zdjęć
    const maxPhotos = getMaxPhotosForContainer(containerId);
    if (photos.length >= maxPhotos) {
      // Wygaś przycisk gdy osiągnięto maksimum
      disableFileInput(containerId);
    } else {
      // Włącz przycisk gdy można dodać więcej
      enableFileInput(containerId);
    }
    
    // Wyświetl wszystkie zdjęcia
    photos.forEach((photo, index) => {
      const photoDiv = document.createElement('div');
      photoDiv.className = 'photo-item';
      
      // Kontener na podgląd z przyciskiem usuwania
      const previewContainer = document.createElement('div');
      previewContainer.className = 'photo-preview-container';
      
      // Podgląd zdjęcia
      const preview = document.createElement('img');
      // Sprawdź czy photo to obiekt z dataUrl czy sam base64 string
      let imageSrc;
      if (typeof photo === 'string') {
        imageSrc = photo;
      } else if (photo && typeof photo === 'object' && photo.dataUrl) {
        imageSrc = photo.dataUrl;
      } else {
        console.error('❌ Nieprawidłowa struktura photo:', photo);
        console.error('❌ photo type:', typeof photo);
        console.error('❌ photo keys:', photo ? Object.keys(photo) : 'null');
        imageSrc = '';
      }
      
      // Dodatkowe sprawdzenie imageSrc
      if (typeof imageSrc !== 'string' || !imageSrc.startsWith('data:')) {
        console.error('❌ Nieprawidłowy imageSrc:', imageSrc);
        console.error('❌ imageSrc type:', typeof imageSrc);
        imageSrc = '';
      }
      
      preview.src = imageSrc;
      preview.className = 'photo-preview';
      preview.alt = (photo && photo.name) || `Photo ${index + 1}`;
      
      // Dodaj event listener dla kliknięcia w miniaturkę
      preview.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showImage(imageSrc);
      });
      
      // Przycisk usuwania
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'photo-delete-btn';
      deleteBtn.innerHTML = '×';
      deleteBtn.title = 'Usuń zdjęcie';
      deleteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        removePhoto(containerId, index);
      };
      
      previewContainer.appendChild(preview);
      previewContainer.appendChild(deleteBtn);
      
      photoDiv.appendChild(previewContainer);
      
      container.appendChild(photoDiv);
    });
  }

  // Funkcja do wyświetlania zdjęć w modalu
  function showImage(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modalImg.src = imageSrc;
    modal.style.display = 'block';
  }

  // Funkcja do określenia maksymalnej liczby zdjęć dla kontenera
  function getMaxPhotosForContainer(containerId) {
    switch(containerId) {
      case 'licenseAPreviews':
      case 'licenseBPreviews':
        return 2; // Prawo jazdy - przód i tył
      case 'vehicleAPreviews':
      case 'vehicleBPreviews':
        return 2; // Pojazd - przód i tył
      case 'damageAPreviews':
      case 'damageBPreviews':
      case 'victimPhotosPreviews':
      case 'perpetratorPhotosPreviews':
        return 5; // Uszkodzenia - max 5 zdjęć
      default:
        return 5; // Domyślnie 5 zdjęć
    }
  }

  // Funkcja do wygaszenia input file
  function disableFileInput(containerId) {
    const inputId = getInputIdFromContainer(containerId);
    const input = document.getElementById(inputId);
    if (input) {
      input.disabled = true;
      input.style.opacity = '0.5';
      input.style.cursor = 'not-allowed';
    }
  }

  // Funkcja do włączenia input file
  function enableFileInput(containerId) {
    const inputId = getInputIdFromContainer(containerId);
    const input = document.getElementById(inputId);
    if (input) {
      input.disabled = false;
      input.style.opacity = '1';
      input.style.cursor = 'pointer';
    }
  }

  // Funkcja do mapowania containerId na inputId
  function getInputIdFromContainer(containerId) {
    switch(containerId) {
      case 'licenseAPreviews': return 'licenseAFile';
      case 'licenseBPreviews': return 'licenseBFile';
      case 'vehicleAPreviews': return 'vehicleAFile';
      case 'vehicleBPreviews': return 'vehicleBFile';
      case 'damageAPreviews': return 'damageAFile';
      case 'damageBPreviews': return 'damageBFile';
      case 'victimPhotosPreviews': return 'victimPhotos';
      case 'perpetratorPhotosPreviews': return 'perpetratorPhotos';
      default: return null;
    }
  }

  // Funkcja do usuwania zdjęcia
  function removePhoto(containerId, index) {
    // Znajdź odpowiedni input field na podstawie containerId
    let inputField = null;
    
    if (containerId === 'victimPhotosPreviews') {
      inputField = fields.victimPhotos;
    } else if (containerId === 'perpetratorPhotosPreviews') {
      inputField = fields.perpetratorPhotos;
    } else if (containerId === 'licenseAPreviews') {
      inputField = $('licenseAFile');
    } else if (containerId === 'licenseBPreviews') {
      inputField = $('licenseBFile');
    } else if (containerId === 'vehicleAPreviews') {
      inputField = $('vehicleAFile');
    } else if (containerId === 'vehicleBPreviews') {
      inputField = $('vehicleBFile');
    } else if (containerId === 'damageBPreviews') {
      inputField = $('damageBFile');
    } else if (containerId === 'damageAPreviews') {
      inputField = $('damageAFile');
    }
    
    if (!inputField || !inputField.__dataUrls) {
      console.error('❌ Nie można znaleźć pola lub danych zdjęć');
      return;
    }
    
    // Usuń zdjęcie z tablicy
    inputField.__dataUrls.splice(index, 1);
    
    // Odśwież podgląd (ta funkcja automatycznie włączy przycisk jeśli potrzeba)
    updatePhotoPreviews(containerId, inputField.__dataUrls);
    
    // Jeśli to były zdjęcia uszkodzeń, zaktualizuj również główny formularz
    if (containerId === 'victimPhotosPreviews' || containerId === 'perpetratorPhotosPreviews') {
      // Zaktualizuj podgląd w głównym formularzu
      updatePhotoPreviews(containerId, inputField.__dataUrls);
    }
    
    console.log(`✅ Usunięto zdjęcie ${index + 1} z ${containerId}`);
  }

  // Handle photo uploads and convert to data URLs
  fields.victimPhotos.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    
    // Inicjalizuj listę jeśli nie istnieje
    if (!fields.victimPhotos.__dataUrls) {
      fields.victimPhotos.__dataUrls = [];
    }
    
    // Sprawdź limit 5 zdjęć
    const totalPhotos = fields.victimPhotos.__dataUrls.length + files.length;
    if (totalPhotos > 5) {
      alert(`Możesz mieć maksymalnie 5 zdjęć. Obecnie masz ${fields.victimPhotos.__dataUrls.length}, więc możesz dodać tylko ${5 - fields.victimPhotos.__dataUrls.length} zdjęć.`);
      e.target.value = '';
      return;
    }
    
    // Dodaj nowe pliki do istniejącej listy
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        fields.victimPhotos.__dataUrls.push({
          name: file.name,
          dataUrl: dataUrl,
          type: file.type
        });
      } catch (error) {
        console.error('Error converting file to data URL:', error);
      }
    }
    
    // Aktualizuj podgląd zdjęć
    updatePhotoPreviews('victimPhotosPreviews', fields.victimPhotos.__dataUrls);
    updatePreview();
  });

  fields.perpetratorPhotos.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    
    // Inicjalizuj listę jeśli nie istnieje
    if (!fields.perpetratorPhotos.__dataUrls) {
      fields.perpetratorPhotos.__dataUrls = [];
    }
    
    // Sprawdź limit 5 zdjęć
    const totalPhotos = fields.perpetratorPhotos.__dataUrls.length + files.length;
    if (totalPhotos > 5) {
      alert(`Możesz mieć maksymalnie 5 zdjęć. Obecnie masz ${fields.perpetratorPhotos.__dataUrls.length}, więc możesz dodać tylko ${5 - fields.perpetratorPhotos.__dataUrls.length} zdjęć.`);
      e.target.value = '';
      return;
    }
    
    // Dodaj nowe pliki do istniejącej listy
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        fields.perpetratorPhotos.__dataUrls.push({
          name: file.name,
          dataUrl: dataUrl,
          type: file.type
        });
      } catch (error) {
        console.error('Error converting file to data URL:', error);
      }
    }
    
    console.log(`✅ Dodano ${files.length} zdjęć sprawcy, łącznie: ${fields.perpetratorPhotos.__dataUrls.length}`);
    
    // Aktualizuj podgląd zdjęć
    updatePhotoPreviews('perpetratorPhotosPreviews', fields.perpetratorPhotos.__dataUrls);
    updatePreview();
  });

  // Aktualizacja podglądu w czasie rzeczywistym
  Object.values(fields).forEach((el) => {
    if (!el) return;
    el.addEventListener('input', updatePreview);
    el.addEventListener('change', updatePreview);
  });

  function updatePreview() {
    const data = serializeForm();
    const lines = [
      `=== SPRAWCA KOLIZJI ===`,
      `Imię i nazwisko: ${data.driverAName || ''}`,
      `E-mail: ${data.driverAEmail || ''}`,
      `Adres: ${data.driverAAddress || ''}`,
      `Prawo jazdy: kat. ${data.driverALicenseCategory || ''} seria i nr ${data.driverALicenseNumber || ''}`,
      `Wydane przez: ${data.driverALicenseIssuer || ''}`,
      `Pojazd: ${data.vehicleAMake || ''} nr rej. ${data.vehicleAPlate || ''}`,
      `Właściciel: ${data.vehicleAOwner || 'Kierowca'}`,
      `Polisa OC: ${data.driverAPolicyInfo || ''}`,
      `Ważna do: ${data.driverAPolicyValidUntil || ''}`,
      ``,
      `=== POSZKODOWANY ===`,
      `Imię i nazwisko: ${data.driverBName || ''}`,
      `E-mail: ${data.driverBEmail || ''}`,
      `Adres: ${data.driverBAddress || ''}`,
      `Prawo jazdy: kat. ${data.driverBLicenseCategory || ''} seria i nr ${data.driverBLicenseNumber || ''}`,
      `Wydane przez: ${data.driverBLicenseIssuer || ''}`,
      `Pojazd: ${data.vehicleBMake || ''} nr rej. ${data.vehicleBPlate || ''}`,
      `Właściciel: ${data.vehicleBOwner || 'Kierowca'}`,
      `Polisa OC: ${data.driverBPolicyInfo || ''}`,
      `Ważna do: ${data.driverBPolicyValidUntil || ''}`,
      ``,
      `=== ZDARZENIE ===`,
      `Miejsce: ${data.location || ''}`,
      `Data/godzina: ${data.datetime || ''}`,
      `Szczegóły: ${data.incidentDetails || ''}`,
      ``,
      `=== USZKODZENIA ===`,
      `Pojazd poszkodowanego: ${data.damageDescriptionVictim || ''}`,
      `Szacunkowa wartość szkody poszkodowanego: ${data.damageValueVictim ? data.damageValueVictim + ' PLN' : 'Nie podano'}`,
      `Pojazd sprawcy: ${data.damageDescriptionPerpetrator || ''}`,
      `Szacunkowa wartość szkody sprawcy: ${data.damageValuePerpetrator ? data.damageValuePerpetrator + ' PLN' : 'Nie podano'}`,
      `Inne: ${data.additionalInfo || ''}`,
      `Zdjęcia poszkodowanego: ${data.victimPhotosDataUrl?.length || 0} zdjęć`,
      `Zdjęcia sprawcy: ${data.perpetratorPhotosDataUrl?.length || 0} zdjęć`,
      ``,
      `=== PODPISY ===`,
      `Podpis sprawcy: ${data.driverASignature ? '✓ Podpisano' : '❌ Nie podpisano'}`,
      `Podpis poszkodowanego: ${data.driverBSignature ? '✓ Podpisano' : '❌ Nie podpisano'}`,
    ];
    previewEl.textContent = lines.join('\n');
  }

  function serializeForm() {
    return {
      driverAName: fields.driverAName.value.trim(),
      driverAEmail: (fields.driverAEmail?.value || '').trim(),
      driverAAddress: fields.driverAAddress.value.trim(),
      driverALicenseCategory: fields.driverALicenseCategory.value.trim(),
      driverALicenseNumber: fields.driverALicenseNumber.value.trim(),
      driverALicenseIssuer: fields.driverALicenseIssuer.value.trim(),
      vehicleAMake: fields.vehicleAMake.value.trim(),
      vehicleAOwner: fields.vehicleAOtherOwner.checked ? fields.vehicleAOwner.value.trim() : fields.driverAName.value.trim(),
      driverAPolicyInfo: fields.driverAPolicyInfo.value.trim(),
      driverAPolicyValidUntil: fields.driverAPolicyValidUntil.value,
      vehicleAPlate: fields.vehicleAPlate.value.trim(),
      location: fields.location.value.trim(),
      datetime: fields.datetime.value,
      driverBName: fields.driverBName.value.trim(),
      driverBEmail: (fields.driverBEmail?.value || '').trim(),
      driverBAddress: fields.driverBAddress.value.trim(),
      driverBLicenseCategory: fields.driverBLicenseCategory.value.trim(),
      driverBLicenseNumber: fields.driverBLicenseNumber.value.trim(),
      driverBLicenseIssuer: fields.driverBLicenseIssuer.value.trim(),
      vehicleBMake: fields.vehicleBMake.value.trim(),
      vehicleBOwner: fields.vehicleBOtherOwner.checked ? fields.vehicleBOwner.value.trim() : fields.driverBName.value.trim(),
      driverBPolicyInfo: fields.driverBPolicyInfo.value.trim(),
      driverBPolicyValidUntil: fields.driverBPolicyValidUntil.value,
      vehicleBPlate: fields.vehicleBPlate.value.trim(),
      incidentDetails: fields.incidentDetails.value.trim(),
      damageDescriptionVictim: fields.damageDescriptionVictim.value.trim(),
      damageValueVictim: fields.damageValueVictim.value.trim(),
      damageDescriptionPerpetrator: fields.damageDescriptionPerpetrator.value.trim(),
      damageValuePerpetrator: fields.damageValuePerpetrator.value.trim(),
      additionalInfo: fields.additionalInfo.value.trim(),
      // zdjęcia uszkodzeń jako dataURL (opcjonalnie)
      victimPhotosDataUrl: fields.victimPhotos.__dataUrls || [],
      perpetratorPhotosDataUrl: fields.perpetratorPhotos.__dataUrls || [],
      // podpisy jako dataURL
      driverASignature: driverASignature ? driverASignature.toDataURL() : '',
      driverBSignature: driverBSignature ? driverBSignature.toDataURL() : '',
    };
  }


  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Dyktowanie mowy -> Web Speech API
  dictateBtn.addEventListener('click', async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Fallback mobilny: nagrywanie audio, jeśli dostępne; w przeciwnym razie manualny modal
      if (navigator.mediaDevices && window.MediaRecorder) {
        recordModal?.classList.remove('hidden');
      } else {
        manualModal?.classList.remove('hidden');
      }
      return;
    }

    // Toggle: jeśli już słuchamy, zatrzymaj i wyślij do AI
    if (isListening && recognition) {
      recognition.stop();
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL';
    recognition.interimResults = true; // pokazuj tekst na żywo
    recognition.continuous = true; // nasłuchuj ciągle
    recognition.maxAlternatives = 1;

    accumulatedTranscript = '';

    // UI: pokaż banner, zmień stan przycisku
    const startDictationUI = () => {
      if (speechBanner) speechBanner.classList.remove('hidden');
      if (speechLiveText) speechLiveText.textContent = '';
      dictateBtn.textContent = 'Zakończ nagrywanie';
      isListening = true;
    };
    const stopDictationUI = () => {
      if (speechBanner) speechBanner.classList.add('hidden');
      dictateBtn.textContent = hasDictated ? 'Uaktualnij opis zdarzenia' : '🎤 Opisz zdarzenie';
      isListening = false;
      
      // Pokaż ramkę z tekstem dyktowania
      if (accumulatedTranscript.trim()) {
        dictationText.classList.remove('hidden');
        dictationContent.textContent = accumulatedTranscript;
      }
    };

    recognition.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          accumulatedTranscript += res[0].transcript + ' ';
        } else {
          interimText += res[0].transcript + ' ';
        }
      }
      if (speechLiveText) {
        speechLiveText.textContent = (accumulatedTranscript + ' ' + interimText).trim();
      }
    };

    recognition.onerror = (e) => {
      console.error('Speech error', e);
      stopDictationUI();
    };

    recognition.onend = async () => {
      // Gdy zatrzymamy nasłuchiwanie: wyślij zebrany tekst do AI
      const transcript = (accumulatedTranscript || (speechLiveText?.textContent || '')).trim();
      stopDictationUI();
      if (!transcript) return;
      setAiStatus('Przetwarzam dyktowane oświadczenie...', '');
      try {
        const resp = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript }),
        });
        const data = await resp.json();
        if (data.ok && data.fields) {
          applyAiFields(data.fields, hasDictated /* allowOverwrite */);
          updatePreview();
          // Auto-zapis jeżeli wszystkie wymagane pola są wypełnione
          const requiredOk = validateRequiredSilent();
          if (requiredOk) {
            await saveStatementSilent();
            setAiStatus('Oświadczenie zapisane po dyktowaniu.', 'success');
          } else {
            setAiStatus('Uzupełnij wymagane pola: Kierowca A, Pojazd A, Miejsce, Data/Godzina.', 'warn');
          }
          hasDictated = true;
          dictateBtn.textContent = 'Uaktualnij oświadczenie';
        }
      } catch (e) {
        console.error('AI analyze error', e);
        setAiStatus('Błąd przetwarzania AI. Spróbuj ponownie.', 'warn');
      }
    };

    recognition.start();
    startDictationUI();
  });

  // Modal do wyświetlania zdjęć
  const imageModal = document.getElementById('imageModal');
  const imageClose = document.querySelector('.image-close');
  
  if (imageClose) {
    imageClose.addEventListener('click', () => {
      imageModal.style.display = 'none';
    });
  }
  
  if (imageModal) {
    imageModal.addEventListener('click', (e) => {
      if (e.target === imageModal) {
        imageModal.style.display = 'none';
      }
    });
  }

  // QR modal open/close
  // Weryfikacja polisy OC
  verifyPolicyBtn.addEventListener('click', verifyPolicy);

  // Weryfikacja polisy OC dla poszkodowanego
  verifyPolicyBBtn.addEventListener('click', verifyPolicyB);

  // Pobieranie lokalizacji GPS
  getLocationBtn.addEventListener('click', getCurrentLocation);

  // Przyciski dyktowania
  applyDictationBtn.addEventListener('click', async () => {
    const transcript = dictationContent.textContent.trim();
    if (!transcript) return;
    
    setAiStatus('Analiza opisu zdarzenia...', '');
    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
      });
      const data = await response.json();
      if (data.ok && data.fields) {
        // Uzupełnij tylko pola związane ze zdarzeniem
        const eventFields = ['incidentDetails', 'damageDescriptionVictim', 'damageDescriptionPerpetrator', 'additionalInfo'];
        eventFields.forEach(field => {
          if (data.fields[field] && fields[field]) {
            fields[field].value = data.fields[field];
          }
        });
        updatePreview();
        setAiStatus('✅ Pola zdarzenia zostały uzupełnione na podstawie opisu', 'success');
        hasDictated = true;
        dictateBtn.textContent = 'Uaktualnij opis zdarzenia';
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      setAiStatus('❌ Błąd analizy opisu zdarzenia', 'warn');
    }
  });

  clearDictationBtn.addEventListener('click', () => {
    dictationText.classList.add('hidden');
    dictationContent.textContent = '';
    accumulatedTranscript = '';
  });

  // Dyktowanie uszkodzeń poszkodowanego
  const dictateDamageVictimBtn = $('dictateDamageVictimBtn');
  const dictationDamageVictimText = $('dictationDamageVictimText');
  const dictationDamageVictimContent = $('dictationDamageVictimContent');
  const applyDictationDamageVictimBtn = $('applyDictationDamageVictimBtn');
  const clearDictationDamageVictimBtn = $('clearDictationDamageVictimBtn');

  if (dictateDamageVictimBtn) {
    let damageVictimRecognition = null;
    let isListeningDamageVictim = false;
    
    dictateDamageVictimBtn.addEventListener('click', () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('Rozpoznawanie mowy nie jest dostępne w tej przeglądarce');
        return;
      }

      // Toggle: jeśli już słuchamy, zatrzymaj nagrywanie
      if (isListeningDamageVictim && damageVictimRecognition) {
        damageVictimRecognition.stop();
        isListeningDamageVictim = false;
        dictateDamageVictimBtn.textContent = '🎤 Podyktuj';
        return;
      }

      damageVictimRecognition = new SpeechRecognition();
      damageVictimRecognition.lang = 'pl-PL';
      damageVictimRecognition.interimResults = true; // pokazuj tekst na żywo
      damageVictimRecognition.continuous = true; // nasłuchuj ciągle
      damageVictimRecognition.maxAlternatives = 1;

      let accumulatedTranscript = '';

      dictateDamageVictimBtn.textContent = '⏹️ Zatrzymaj';
      dictateDamageVictimBtn.disabled = false;
      isListeningDamageVictim = true;
      
      // Pokaż czerwony banner jak główny przycisk
      if (speechBanner) speechBanner.classList.remove('hidden');
      if (speechLiveText) speechLiveText.textContent = 'Nagrywanie opisu uszkodzeń poszkodowanego... Mów wyraźnie!';

      damageVictimRecognition.onresult = (event) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            accumulatedTranscript += res[0].transcript + ' ';
          } else {
            interimText += res[0].transcript + ' ';
          }
        }
        
        // Pokaź tekst na żywo w content
        const liveText = (accumulatedTranscript + ' ' + interimText).trim();
        dictationDamageVictimContent.textContent = liveText;
        dictationDamageVictimText.classList.remove('hidden');
      };

      damageVictimRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        dictateDamageVictimBtn.textContent = '🎤 Podyktuj';
        dictateDamageVictimBtn.disabled = false;
        damageVictimRecognition = null;
        isListeningDamageVictim = false;
        
        // Ukryj czerwony banner
        if (speechBanner) speechBanner.classList.add('hidden');
      };

      damageVictimRecognition.onend = () => {
        dictateDamageVictimBtn.textContent = '🎤 Podyktuj';
        dictateDamageVictimBtn.disabled = false;
        damageVictimRecognition = null;
        isListeningDamageVictim = false;
        
        // Ukryj czerwony banner
        if (speechBanner) speechBanner.classList.add('hidden');
        
        // Ustaw finalny tekst
        if (accumulatedTranscript.trim()) {
          dictationDamageVictimContent.textContent = accumulatedTranscript.trim();
        }
      };

      damageVictimRecognition.start();
    });
  }

  if (applyDictationDamageVictimBtn) {
    applyDictationDamageVictimBtn.addEventListener('click', async () => {
      const transcript = dictationDamageVictimContent.textContent.trim();
      if (!transcript) return;
      
      if (fields.damageDescriptionVictim) {
        fields.damageDescriptionVictim.value = transcript;
      }
      
      // Ukryj banner po zastosowaniu
      if (speechBanner) speechBanner.classList.add('hidden');
      dictationDamageVictimText.classList.add('hidden');
      
      // Analiza AI dla opisu uszkodzeń poszkodowanego
      setAiStatus('Analiza opisu uszkodzeń...', '');
      try {
        const response = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript })
        });
        const data = await response.json();
        if (data.ok && data.fields) {
          // Uzupełnij związane pola (szczególnie damageDescriptionVictim i damageValueVictim)
          if (data.fields.damageDescriptionVictim && fields.damageDescriptionVictim) {
            fields.damageDescriptionVictim.value = data.fields.damageDescriptionVictim;
          }
          if (data.fields.damageValueVictim && fields.damageValueVictim) {
            fields.damageValueVictim.value = data.fields.damageValueVictim;
          }
          updatePreview();
          setAiStatus('Opis uszkodzeń przeanalizowany', 'success');
        }
      } catch (error) {
        console.error('AI analysis error:', error);
        setAiStatus('Błąd analizy AI', 'error');
      }
    });
  }

  if (clearDictationDamageVictimBtn) {
    clearDictationDamageVictimBtn.addEventListener('click', () => {
      dictationDamageVictimText.classList.add('hidden');
      dictationDamageVictimContent.textContent = '';
    });
  }

  // Dyktowanie uszkodzeń sprawcy
  const dictateDamagePerpetratorBtn = $('dictateDamagePerpetratorBtn');
  const dictationDamagePerpetratorText = $('dictationDamagePerpetratorText');
  const dictationDamagePerpetratorContent = $('dictationDamagePerpetratorContent');
  const applyDictationDamagePerpetratorBtn = $('applyDictationDamagePerpetratorBtn');
  const clearDictationDamagePerpetratorBtn = $('clearDictationDamagePerpetratorBtn');

  if (dictateDamagePerpetratorBtn) {
    let damagePerpetratorRecognition = null;
    let isListeningDamagePerpetrator = false;
    
    dictateDamagePerpetratorBtn.addEventListener('click', () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('Rozpoznawanie mowy nie jest dostępne w tej przeglądarce');
        return;
      }

      // Toggle: jeśli już słuchamy, zatrzymaj nagrywanie
      if (isListeningDamagePerpetrator && damagePerpetratorRecognition) {
        damagePerpetratorRecognition.stop();
        isListeningDamagePerpetrator = false;
        dictateDamagePerpetratorBtn.textContent = '🎤 Podyktuj';
        return;
      }

      damagePerpetratorRecognition = new SpeechRecognition();
      damagePerpetratorRecognition.lang = 'pl-PL';
      damagePerpetratorRecognition.interimResults = true; // pokazuj tekst na żywo
      damagePerpetratorRecognition.continuous = true; // nasłuchuj ciągle
      damagePerpetratorRecognition.maxAlternatives = 1;

      let accumulatedTranscript = '';

      dictateDamagePerpetratorBtn.textContent = '⏹️ Zatrzymaj';
      dictateDamagePerpetratorBtn.disabled = false;
      isListeningDamagePerpetrator = true;
      
      // Pokaź czerwony banner jak główny przycisk
      if (speechBanner) speechBanner.classList.remove('hidden');
      if (speechLiveText) speechLiveText.textContent = 'Nagrywanie opisu uszkodzeń sprawcy... Mów wyraźnie!';

      damagePerpetratorRecognition.onresult = (event) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            accumulatedTranscript += res[0].transcript + ' ';
          } else {
            interimText += res[0].transcript + ' ';
          }
        }
        
        // Pokaź tekst na żywo w content
        const liveText = (accumulatedTranscript + ' ' + interimText).trim();
        dictationDamagePerpetratorContent.textContent = liveText;
        dictationDamagePerpetratorText.classList.remove('hidden');
      };

      damagePerpetratorRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        dictateDamagePerpetratorBtn.textContent = '🎤 Podyktuj';
        dictateDamagePerpetratorBtn.disabled = false;
        damagePerpetratorRecognition = null;
        isListeningDamagePerpetrator = false;
        
        // Ukryj czerwony banner
        if (speechBanner) speechBanner.classList.add('hidden');
      };

      damagePerpetratorRecognition.onend = () => {
        dictateDamagePerpetratorBtn.textContent = '🎤 Podyktuj';
        dictateDamagePerpetratorBtn.disabled = false;
        damagePerpetratorRecognition = null;
        isListeningDamagePerpetrator = false;
        
        // Ukryj czerwony banner
        if (speechBanner) speechBanner.classList.add('hidden');
        
        // Ustaw finalny tekst
        if (accumulatedTranscript.trim()) {
          dictationDamagePerpetratorContent.textContent = accumulatedTranscript.trim();
        }
      };

      damagePerpetratorRecognition.start();
    });
  }

  if (applyDictationDamagePerpetratorBtn) {
    applyDictationDamagePerpetratorBtn.addEventListener('click', async () => {
      const transcript = dictationDamagePerpetratorContent.textContent.trim();
      if (!transcript) return;
      
      if (fields.damageDescriptionPerpetrator) {
        fields.damageDescriptionPerpetrator.value = transcript;
      }
      
      // Ukryj banner po zastosowaniu
      if (speechBanner) speechBanner.classList.add('hidden');
      dictationDamagePerpetratorText.classList.add('hidden');
      
      // Analiza AI dla opisu uszkodzenia sprawcy
      setAiStatus('Analiza opisu uszkodzeń...', '');
      try {
        const response = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript })
        });
        const data = await response.json();
        if (data.ok && data.fields) {
          // Uzupełnij związane pola (szczególnie damageDescriptionPerpetrator i damageValuePerpetrator)
          if (data.fields.damageDescriptionPerpetrator && fields.damageDescriptionPerpetrator) {
            fields.damageDescriptionPerpetrator.value = data.fields.damageDescriptionPerpetrator;
          }
          if (data.fields.damageValuePerpetrator && fields.damageValuePerpetrator) {
            fields.damageValuePerpetrator.value = data.fields.damageValuePerpetrator;
          }
          updatePreview();
          setAiStatus('Opis uszkodzeń przeanalizowany', 'success');
        }
      } catch (error) {
        console.error('AI analysis error:', error);
        setAiStatus('Błąd analizy AI', 'error');
      }
    });
  }

  if (clearDictationDamagePerpetratorBtn) {
    clearDictationDamagePerpetratorBtn.addEventListener('click', () => {
      dictationDamagePerpetratorText.classList.add('hidden');
      dictationDamagePerpetratorContent.textContent = '';
    });
  }
  qrClose.addEventListener('click', () => {
    qrModal.classList.add('hidden');
  });
  qrSubmit.addEventListener('click', async () => {
    const token = qrTokenInput.value.trim();
    if (!token) {
      alert('Wklej token JSON z mObywatel (PoC).');
      return;
    }
    try {
      const resp = await fetch('/api/qr/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await resp.json();
      if (data.ok && data.driverB) {
        fields.driverBName.value = data.driverB.name || '';
        fields.driverBPolicyNumber.value = data.driverB.policyNumber || '';
        fields.vehicleBPlate.value = data.driverB.vehiclePlate || '';
        updatePreview();
        qrModal.classList.add('hidden');
      }
    } catch (e) {
      console.error('QR parse error', e);
    }
  });

  // Wyślij na e-mail
  emailBtn.addEventListener('click', async () => {
    const payload = serializeForm();
    console.log('Payload do wysłania na e-mail:', payload);
    
    // Sprawdź czy oświadczenie jest zatwierdzone
    if (!isApproved) {
      alert('Zatwierdź oświadczenie przed wysłaniem na e-mail.');
      return;
    }
    
    // Walidacja z zaznaczaniem błędów na czerwono
    const validationErrors = validateRequiredFields();
    
    if (validationErrors.length > 0) {
      const errorMessage = `Uzupełnij wymagane pola:\n• ${validationErrors.join('\n• ')}`;
      alert(errorMessage);
      return;
    }
    
    // Sprawdź e-maile
    const emailErrors = validateEmails();
    if (emailErrors.length > 0) {
      alert(emailErrors.join('\n'));
      return;
    }
    
    try {
      const resp = await fetch('/api/statement/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data.ok) {
        alert(`Oświadczenie zostało wysłane na e-mail (ID: ${data.id})`);
      } else {
        alert('Błąd wysyłania e-maila: ' + (data.error || 'Nieznany błąd'));
      }
    } catch (e) {
      console.error('Email error', e);
      alert('Błąd komunikacji z serwerem.');
    }
  });

  // Manual modal handlers (fallback dla telefonów bez Web Speech API)
  manualClose?.addEventListener('click', () => {
    manualModal.classList.add('hidden');
  });
  manualAnalyze?.addEventListener('click', async () => {
    const transcript = (manualText?.value || '').trim();
    if (!transcript) {
      alert('Wpisz lub wklej treść oświadczenia.');
      return;
    }
    setAiStatus('Przetwarzam wprowadzone oświadczenie...', '');
    try {
      const resp = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await resp.json();
      if (data.ok && data.fields) {
        applyAiFields(data.fields, hasDictated);
        updatePreview();
        const requiredOk = validateRequiredSilent();
        if (requiredOk) {
          await saveStatementSilent();
          setAiStatus('Oświadczenie zapisane.', 'success');
        } else {
          setAiStatus('Uzupełnij wymagane pola: Kierowca A, Pojazd A, Miejsce, Data/Godzina.', 'warn');
        }
        manualModal.classList.add('hidden');
        hasDictated = true;
        dictateBtn.textContent = 'Uaktualnij oświadczenie';
      }
    } catch (e) {
      console.error('AI analyze error', e);
      setAiStatus('Błąd przetwarzania AI. Spróbuj ponownie.', 'warn');
    }
  });

  // Nagrywanie audio – mobile modal
  recClose?.addEventListener('click', () => {
    recordModal.classList.add('hidden');
    resetRecordingUI();
  });

  recStart?.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickSupportedMimeType(['audio/mp4', 'audio/mpeg', 'audio/webm']);
      recordedChunks = [];
      recordedBlob = null;
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/mp4' });
        if (recPreview) {
          recPreview.src = URL.createObjectURL(recordedBlob);
          recPreview.classList.remove('hidden');
        }
        recSend.disabled = !recordedBlob;
      };
      mediaRecorder.start();
      recStart.disabled = true;
      recStop.disabled = false;
      recSend.disabled = true;
    } catch (e) {
      console.error('getUserMedia error', e);
      alert('Nie udało się uzyskać dostępu do mikrofonu.');
    }
  });

  recStop?.addEventListener('click', () => {
    try { mediaRecorder?.stop(); } catch {}
    recStop.disabled = true;
  });

  recSend?.addEventListener('click', async () => {
    if (!recordedBlob) return;
    setAiStatus('Transkrypcja nagrania...', '');
    try {
      const fd = new FormData();
      const ext = (recordedBlob.type.includes('mp4') ? 'm4a' : recordedBlob.type.includes('mpeg') ? 'mp3' : 'webm');
      fd.append('audio', recordedBlob, `recording.${ext}`);
      const tr = await fetch('/api/ai/transcribe', { method: 'POST', body: fd });
      const trJson = await tr.json();
      if (!tr.ok || !trJson.ok) {
        throw new Error(trJson?.error || 'Błąd transkrypcji');
      }
      const transcript = trJson.transcript || '';
      setAiStatus('Analiza AI...', '');
      const resp = await fetch('/api/ai/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript })
      });
      const data = await resp.json();
      if (data.ok && data.fields) {
        applyAiFields(data.fields, hasDictated);
        updatePreview();
        const requiredOk = validateRequiredSilent();
        if (requiredOk) {
          await saveStatementSilent();
          setAiStatus('Oświadczenie zapisane.', 'success');
        } else {
          setAiStatus('Uzupełnij wymagane pola: Kierowca A, Pojazd A, Miejsce, Data/Godzina.', 'warn');
        }
        recordModal.classList.add('hidden');
        resetRecordingUI();
        hasDictated = true;
        dictateBtn.textContent = 'Uaktualnij oświadczenie';
      }
    } catch (e) {
      console.error('Transcribe/analyze error', e);
      setAiStatus('Błąd transkrypcji/analizy. Sprawdź konfigurację backendu Whisper.', 'warn');
    }
  });

  function resetRecordingUI() {
    recStart.disabled = false;
    recStop.disabled = true;
    recSend.disabled = true;
    if (recPreview) {
      recPreview.classList.add('hidden');
      recPreview.removeAttribute('src');
    }
    recordedChunks = [];
    recordedBlob = null;
    try { mediaRecorder?.stream.getTracks().forEach(t => t.stop()); } catch {}
    mediaRecorder = null;
  }

  function pickSupportedMimeType(candidates) {
    if (!window.MediaRecorder || !window.MediaRecorder.isTypeSupported) return null;
    for (const c of candidates) { if (MediaRecorder.isTypeSupported(c)) return c; }
    return null;
  }

  function applyAiFields(ai, allowOverwrite) {
    const set = (el, val) => { if (val == null) return; el.value = allowOverwrite ? val : (el.value || val); };
    // Pola A
    set(fields.driverAName, ai.driverAName || '');
    set(fields.vehicleAPlate, ai.vehicleAPlate || '');
    set(fields.location, ai.location || '');
    if (ai.datetime) {
      if (allowOverwrite || !fields.datetime.value) fields.datetime.value = ai.datetime;
    }
    // Pola B i opis – zwykle nadpisujemy przy aktualizacji
    if (allowOverwrite) {
      if (ai.driverBName) fields.driverBName.value = ai.driverBName;
      if (ai.driverBPolicyNumber) fields.driverBPolicyNumber.value = ai.driverBPolicyNumber;
      if (ai.vehicleBPlate) fields.vehicleBPlate.value = ai.vehicleBPlate;
      if (ai.incidentDetails) fields.incidentDetails.value = ai.incidentDetails;
    } else {
      fields.driverBName.value = fields.driverBName.value || ai.driverBName || '';
      fields.driverBPolicyNumber.value = fields.driverBPolicyNumber.value || ai.driverBPolicyNumber || '';
      fields.vehicleBPlate.value = fields.vehicleBPlate.value || ai.vehicleBPlate || '';
      fields.incidentDetails.value = fields.incidentDetails.value || ai.incidentDetails || '';
    }
  }

  function validateRequiredSilent() {
    const data = serializeForm();
    return Boolean(data.driverAName && data.vehicleAPlate && data.location && data.datetime);
  }

  async function saveStatementSilent() {
    const payload = serializeForm();
    const resp = await fetch('/api/statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    return data?.ok === true;
  }

  function setAiStatus(text, type) {
    if (!aiStatus) return;
    aiStatus.textContent = text || '';
    aiStatus.classList.remove('success', 'warn');
    if (type) aiStatus.classList.add(type);
  }


  // Pobierz oświadczenie
  downloadBtn.addEventListener('click', async () => {
    // Sprawdź czy oświadczenie jest zatwierdzone
    if (!isApproved) {
      alert('Zatwierdź oświadczenie przed pobraniem PDF.');
      return;
    }
    
    const payload = serializeForm();
    
    // Walidacja z zaznaczaniem błędów na czerwono
    const validationErrors = validateRequiredFields();
    
    if (validationErrors.length > 0) {
      const errorMessage = `Uzupełnij wymagane pola:\n• ${validationErrors.join('\n• ')}`;
      alert(errorMessage);
      return;
    }
    
    try {
      // Najpierw zapisz oświadczenie
      const saveResp = await fetch('/api/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saveData = await saveResp.json();
      
      if (saveData.ok) {
        // Następnie pobierz PDF (użyj endpointu bez autoryzacji admin)
        const pdfUrl = `/api/download/${saveData.id}/pdf`;
        window.open(pdfUrl, '_blank');
      } else {
        alert('Błąd zapisu oświadczenia: ' + (saveData.error || 'Nieznany błąd'));
      }
    } catch (e) {
      console.error('PDF generation error', e);
      alert('Błąd generowania PDF.');
    }
  });

  // Inicjalny podgląd
  updatePreview();
});


