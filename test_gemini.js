#!/usr/bin/env node

/**
 * Test Google Gemini API
 * Użycie: node test_gemini.js
 */

const fs = require('fs');
require('dotenv').config();

// Przykładowy obraz base64 (mały test)
const TEST_IMAGE_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

async function testGeminiAPI() {
  console.log('🔍 Testowanie Google Gemini API...\n');
  
  // Sprawdź czy klucz jest dostępny
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.log('❌ BŁĄD: GEMINI_API_KEY nie jest ustawiony w .env');
    console.log('📝 Dodaj do pliku .env:');
    console.log('   GEMINI_API_KEY=twój_klucz_tutaj');
    return;
  }
  
  console.log('✅ Klucz API znaleziony:', apiKey.substring(0, 10) + '...');
  
  // Konwertuj obraz na base64 bez prefiksu
  const imageBase64 = TEST_IMAGE_BASE64.replace(/^data:image\/[a-z]+;base64,/, '');
  
  try {
    console.log('📤 Wysyłam żądanie do Gemini API...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Przeanalizuj załączony obraz i opisz co widzisz. Zwróć wynik w formacie JSON.' },
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
          maxOutputTokens: 2048,
        }
      })
    });

    console.log('📊 Status odpowiedzi:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ BŁĄD API:', errorText);
      return;
    }

    const data = await response.json();
    
    console.log('✅ Sukces! Otrzymano odpowiedź z Gemini API');
    console.log('📋 Struktura odpowiedzi:');
    console.log(JSON.stringify(data, null, 2));
    
    // Sprawdź czy są wykryte teksty
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const text = data.candidates[0].content.parts[0].text;
      console.log('\n📝 Odpowiedź Gemini:');
      console.log(text);
    }
    
  } catch (error) {
    console.log('💥 BŁĄD:', error.message);
    
    if (error.message.includes('fetch')) {
      console.log('💡 Wskazówka: Sprawdź połączenie internetowe');
    } else if (error.message.includes('API key')) {
      console.log('💡 Wskazówka: Sprawdź czy klucz API jest poprawny');
    }
  }
}

async function testOurAPI() {
  console.log('\n🔍 Testowanie naszego API z Gemini...\n');
  
  try {
    const response = await fetch('http://localhost:4000/api/ai/analyze-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData: TEST_IMAGE_BASE64,
        imageType: 'jpeg',
        analysisType: 'license'
      })
    });

    const result = await response.json();
    
    console.log('📊 Status:', response.status);
    console.log('📋 Odpowiedź:', JSON.stringify(result, null, 2));
    
    if (result.source) {
      console.log(`\n🎯 ŹRÓDŁO ODPOWIEDZI: ${result.source.toUpperCase()}`);
      
      if (result.source === 'gemini') {
        console.log('✅ Używany Gemini API!');
      } else if (result.source === 'ollama') {
        console.log('🤖 Używany Ollama (fallback)');
      }
    } else {
      console.log('⚠️  Brak informacji o źródle odpowiedzi');
    }
    
  } catch (error) {
    console.log('💥 BŁĄD naszego API:', error.message);
  }
}

async function main() {
  console.log('🚀 Test Google Gemini API\n');
  console.log('=' .repeat(50));
  
  // Test 1: Bezpośrednie wywołanie Gemini API
  await testGeminiAPI();
  
  console.log('\n' + '=' .repeat(50));
  
  // Test 2: Nasze API z integracją Gemini
  await testOurAPI();
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ Test zakończony!');
}

if (require.main === module) {
  main().catch(console.error);
}
