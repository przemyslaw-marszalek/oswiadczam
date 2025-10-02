# Oświadczenie Powypadkowe - PoC

Aplikacja do tworzenia oświadczeń sprawcy kolizji drogowej z funkcjami AI, dyktowania i wysyłania e-maili.

## Nowe funkcje

### Przyciski akcji
- **Wyślij na e-mail** - wysyła oświadczenie wraz ze zdjęciami na adresy e-mail sprawcy i poszkodowanego
- **Pobierz oświadczenie** - pobiera PDF oświadczenia

### Funkcjonalności e-mail
- Automatyczne wysyłanie PDF oświadczenia
- Załączanie zdjęć uszkodzeń jako załączniki
- Wysyłanie na adresy sprawcy i poszkodowanego (jeśli podane)
- Automatyczne zapisywanie w lokalnej bazie danych

### Konfiguracja e-maili

Aby korzystać z funkcji wysyłania e-maili, skonfiguruj zmienne środowiskowe:

```bash
# Gmail example
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=your-email@gmail.com
export SMTP_PASS=your-app-password
```

#### Dla Gmail:
1. Włącz uwierzytelnianie dwuskładnikowe
2. Wygeneruj "Hasło aplikacji" dla tej aplikacji
3. Użyj hasła aplikacji zamiast zwykłego hasła

#### Inni dostawcy SMTP:
- Outlook/Hotmail: `smtp-mail.outlook.com:587`
- Yahoo: `smtp.mail.yahoo.com:587`
- Własny SMTP: `your-smtp-server.com:587`

## Uruchomienie

```bash
npm install
npm start
```

Aplikacja będzie dostępna pod adresem: http://localhost:4000

## Panel administracyjny

Dostępny pod adresem: http://localhost:4000/admin

