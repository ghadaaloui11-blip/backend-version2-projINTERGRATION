#!/usr/bin/env node

/**
 * Quick Account Reference - Solidarity Platform
 * Use this script to quickly test all accounts and get their details
 */

const { Pool } = require('pg');
const http = require('http');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'solidarite_db',
  password: 'postgrespw',
  port: 5432,
});

// Account credentials
const accounts = [
  {
    type: 'ADMIN',
    email: 'admin@solidarite.tn',
    password: 'admin_password_123',
    name: 'System Administrator'
  },
  {
    type: 'ASSOCIATION',
    email: 'solidarite@demo.tn',
    password: 'solidarite123',
    name: 'Solidarité Tunisienne'
  },
  {
    type: 'ASSOCIATION',
    email: 'croissant@rouge.tn',
    password: 'croissant123',
    name: 'Croissant Rouge Tunisien'
  },
  {
    type: 'CITIZEN',
    email: 'sami@test.tn',
    password: 'sami123',
    name: 'Ben Ali Sami'
  }
];

async function testAccountLogin(account) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      email: account.email,
      motDePasse: account.password
    });

    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/connexion',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve({
            ...account,
            success: true,
            role: result.utilisateur?.role,
            token: result.token ? '✅ Valid' : '❌ Missing'
          });
        } catch (err) {
          resolve({ ...account, success: false, error: 'Parse error' });
        }
      });
    });

    req.on('error', () => {
      resolve({ ...account, success: false, error: 'Connection error' });
    });

    req.on('timeout', () => {
      resolve({ ...account, success: false, error: 'Timeout' });
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🔐 Solidarity Platform - Account Reference\n');
  console.log('='.repeat(60));
  
  // Test all accounts
  const results = [];
  for (const account of accounts) {
    console.log(`Testing ${account.type}: ${account.name}...`);
    const result = await testAccountLogin(account);
    results.push(result);
    console.log(`  Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (!result.success) {
      console.log(`  Error: ${result.error}`);
    }
    console.log('');
  }
  
  // Summary
  console.log('📊 Account Summary:');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Working accounts: ${successful.length}/${results.length}`);
  console.log(`❌ Failed accounts: ${failed.length}/${results.length}`);
  
  if (successful.length > 0) {
    console.log('\n🎯 Working Accounts:');
    successful.forEach(account => {
      console.log(`  • ${account.name} (${account.type}) - ${account.email}`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n⚠️  Failed Accounts:');
    failed.forEach(account => {
      console.log(`  • ${account.name} (${account.type}) - ${account.error}`);
    });
  }
  
  console.log('\n🌐 Quick Access Links:');
  console.log('  Frontend: http://localhost:4200/');
  console.log('  Backend:  http://localhost:5000/');
  console.log('  API Test: curl http://localhost:5000/api/campagnes');
  
  await pool.end();
}

main().catch(console.error);