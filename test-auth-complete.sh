#!/bin/bash

echo "======================================"
echo "Test de Autenticación Completo"
echo "======================================"

API_URL="http://localhost:3001"

# Test 1: Login
 echo "Test 1: POST $API_URL/api/auth/login"
echo "--------------------------------------"
RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}')
echo "Response: $RESPONSE"

# Extraer tokens
ACCESS_TOKEN=$(echo $RESPONSE | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"//' | sed 's/"//')
REFRESH_TOKEN=$(echo $RESPONSE | grep -o '"refreshToken":"[^"]*"' | sed 's/"refreshToken":"//' | sed 's/"//')

echo ""
echo "Access Token: ${ACCESS_TOKEN:0:50}..."
echo "Refresh Token: ${REFRESH_TOKEN:0:50}..."
echo ""

# Decodificar access token
if [ -n "$ACCESS_TOKEN" ]; then
  echo "Decoding access token..."
  PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2)
  # Añadir padding si es necesario
  PAD=$((${#PAYLOAD} % 4))
  if [ $PAD -gt 0 ]; then
    PAYLOAD="$PAYLOAD$(printf '%*s' $((4 - $PAD)) | tr ' ' '=')"
  fi
  DECODED=$(echo "$PAYLOAD" | base64 -d 2>/dev/null)
  echo "Decoded: $DECODED"
  
  # Extraer yachtIds
  YACHT_COUNT=$(echo "$DECODED" | grep -o '"yachtIds":\[[^]]*\]' | grep -o '"[0-9a-f-]*"' | wc -l)
  echo "Yachts in token: $YACHT_COUNT"
  echo ""
fi

# Test 2: Refresh
echo "Test 2: POST $API_URL/api/auth/refresh"
echo "--------------------------------------"
if [ -n "$REFRESH_TOKEN" ]; then
  REFRESH_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
  echo "Response: $REFRESH_RESPONSE"
  
  NEW_ACCESS=$(echo $REFRESH_RESPONSE | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"//' | sed 's/"//')
  
  # Decodificar nuevo token
  if [ -n "$NEW_ACCESS" ]; then
    echo ""
    echo "Decoding NEW access token..."
    NEW_PAYLOAD=$(echo "$NEW_ACCESS" | cut -d'.' -f2)
    PAD=$((${#NEW_PAYLOAD} % 4))
    if [ $PAD -gt 0 ]; then
      NEW_PAYLOAD="$NEW_PAYLOAD$(printf '%*s' $((4 - $PAD)) | tr ' ' '=')"
    fi
    NEW_DECODED=$(echo "$NEW_PAYLOAD" | base64 -d 2>/dev/null)
    echo "Decoded: $NEW_DECODED"
    
    NEW_YACHT_COUNT=$(echo "$NEW_DECODED" | grep -o '"yachtIds":\[[^]]*\]' | grep -o '"[0-9a-f-]*"' | wc -l)
    echo "Yachts in NEW token: $NEW_YACHT_COUNT"
    
    # Comparar
    if [ "$YACHT_COUNT" = "$NEW_YACHT_COUNT" ]; then
      echo "✅ SUCCESS: Yacht count maintained after refresh"
    else
      echo "❌ FAIL: Yacht count changed (before: $YACHT_COUNT, after: $NEW_YACHT_COUNT)"
    fi
  fi
else
  echo "No refresh token available"
fi

echo ""
echo "======================================"
echo "Test completado"
echo "======================================"
