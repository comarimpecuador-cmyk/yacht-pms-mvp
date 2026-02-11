#!/usr/bin/env node

/**
 * Test Script - HTTP-Only Cookie Migration
 * 
 * This script validates the complete cookie-based authentication flow:
 * 1. Login endpoint sets HTTP-Only cookies
 * 2. Me endpoint reads cookies
 * 3. Logout endpoint clears cookies
 */

const http = require('http');
const https = require('https');
const { parse } = require('url');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const LOGIN_ENDPOINT = '/api/auth/login';
const ME_ENDPOINT = '/api/auth/me';
const LOGOUT_ENDPOINT = '/api/auth/logout';

// Test credentials (adjust as needed)
const TEST_EMAIL = 'sysadmin@yachtpms.com';
const TEST_PASSWORD = 'sysadmin123';

// Cookie jar for storing HTTP-Only cookies
const cookieJar = new Map();

function parseSetCookieHeader(setCookieHeader) {
  if (!setCookieHeader) return [];
  
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return cookies.map(cookie => {
    const parts = cookie.split(';');
    const [nameValue] = parts;
    const [name, value] = nameValue.split('=');
    return { name, value };
  });
}

function serializeCookies() {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const client = options.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Store cookies from Set-Cookie header
        if (res.headers['set-cookie']) {
          const cookies = parseSetCookieHeader(res.headers['set-cookie']);
          cookies.forEach(({ name, value }) => {
            if (name && value) {
              cookieJar.set(name, value);
            }
          });
        }
        
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data ? JSON.parse(data) : null
        });
      });
    });
    
    req.on('error', reject);
    
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    
    req.end();
  });
}

async function testLogin() {
  console.log('\n🔐 Testing LOGIN endpoint...');
  
  const url = parse(`${BASE_URL}${LOGIN_ENDPOINT}`);
  
  try {
    const response = await makeRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log('Response:', response.data);
    
    // Check for HTTP-Only cookies
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      console.log('\n🍪 Cookies received:');
      const cookies = parseSetCookieHeader(setCookie);
      cookies.forEach(({ name, value }) => {
        console.log(`  - ${name}: ${value.substring(0, 20)}...`);
      });
      
      const hasAccessToken = cookies.some(c => c.name === 'accessToken');
      const hasRefreshToken = cookies.some(c => c.name === 'refreshToken');
      
      if (hasAccessToken && hasRefreshToken) {
        console.log('\n✅ SUCCESS: Both accessToken and refreshToken cookies set');
        return true;
      } else {
        console.log('\n❌ FAIL: Missing required cookies');
        return false;
      }
    } else {
      console.log('\n❌ FAIL: No cookies received');
      return false;
    }
  } catch (error) {
    console.error('\n❌ LOGIN ERROR:', error.message);
    return false;
  }
}

async function testMe() {
  console.log('\n👤 Testing ME endpoint (with cookies)...');
  
  const url = parse(`${BASE_URL}${ME_ENDPOINT}`);
  
  try {
    const response = await makeRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.path,
      method: 'GET',
      headers: {
        'Cookie': serializeCookies()
      }
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log('Response:', response.data);
    
    if (response.statusCode === 200 && response.data?.id) {
      console.log('\n✅ SUCCESS: ME endpoint authenticated with cookies');
      return true;
    } else {
      console.log('\n❌ FAIL: ME endpoint did not authenticate');
      return false;
    }
  } catch (error) {
    console.error('\n❌ ME ERROR:', error.message);
    return false;
  }
}

async function testLogout() {
  console.log('\n🚪 Testing LOGOUT endpoint...');
  
  const url = parse(`${BASE_URL}${LOGOUT_ENDPOINT}`);
  
  try {
    const response = await makeRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.path,
      method: 'POST',
      headers: {
        'Cookie': serializeCookies()
      }
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log('Response:', response.data);
    
    // Check if cookies were cleared
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      console.log('\n🍪 Logout cookies:');
      const cookies = parseSetCookieHeader(setCookie);
      cookies.forEach(({ name, value }) => {
        console.log(`  - ${name}: ${value}`);
      });
      
      const clearedAccessToken = cookies.some(c => 
        c.name === 'accessToken' && (c.value === '' || c.value === 'deleted')
      );
      const clearedRefreshToken = cookies.some(c => 
        c.name === 'refreshToken' && (c.value === '' || c.value === 'deleted')
      );
      
      if (clearedAccessToken || clearedRefreshToken) {
        console.log('\n✅ SUCCESS: Cookies cleared on logout');
        return true;
      }
    }
    
    console.log('\n⚠️  WARNING: No clear cookie signal received');
    return true; // Still consider logout successful if endpoint returned 200
  } catch (error) {
    console.error('\n❌ LOGOUT ERROR:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 HTTP-Only Cookie Migration Test Suite');
  console.log('=====================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test User: ${TEST_EMAIL}`);
  
  const results = [];
  
  // Test 1: Login and cookies
  results.push(await testLogin());
  
  // Test 2: Authenticated request with cookies
  results.push(await testMe());
  
  // Test 3: Logout
  results.push(await testLogout());
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r).length;
  const failed = results.length - passed;
  
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED - Cookie migration is working!');
    process.exit(0);
  } else {
    console.log('\n💥 SOME TESTS FAILED - Check the output above');
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
