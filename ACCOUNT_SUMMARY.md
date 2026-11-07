# Account Summary - Solidarity Platform

## 📋 Account Overview

This document provides a comprehensive summary of all test accounts created for the solidarity platform.

---

## 👤 Admin Account

### **Admin Account**
- **Email:** `admin@solidarite.tn`
- **Password:** `admin_password_123`
- **Role:** Admin
- **Access Level:** Full system access
- **Created:** Via migration script
- **Status:** ✅ Active

**Admin Capabilities:**
- Approve/reject association applications
- Manage all platform users
- View and manage all campaigns
- Access all reports and documents
- System-wide administrative functions

---

## 🏢 Association Accounts

### **Association 1: Solidarité Tunisienne**
- **Email:** `solidarite@demo.tn`
- **Password:** `solidarite123`
- **Role:** Association
- **Status:** ✅ Approved
- **Contact:** Directeur
- **Phone:** +216 12 345 678
- **Address:** 123 Avenue de la Solidarité, Tunis
- **Tax ID:** TN1234567890123

**Association Capabilities:**
- Create and manage donation campaigns
- Upload legal documents
- Track donations and fund usage
- Manage reports and signalements
- View campaign statistics

### **Association 2: Croissant Rouge Tunisien**
- **Email:** `croissant@rouge.tn`
- **Password:** `croissant123`
- **Role:** Association
- **Status:** ✅ Approved
- **Contact:** Responsable
- **Phone:** +216 98 765 432
- **Address:** 45 Rue de la Paix, Tunis
- **Tax ID:** TN9876543210987

**Association Capabilities:**
- Create and manage donation campaigns
- Upload legal documents
- Track donations and fund usage
- Manage reports and signalements
- View campaign statistics

### **Existing Association (from demo data)**
- **Email:** `asso@test.tn`
- **Organization:** Aide aux orphelins
- **Status:** ✅ Approved
- **Phone:** +212 345 67

---

## 👥 Citizen Account

### **Citizen Account**
- **Email:** `sami@test.tn`
- **Password:** `sami123`
- **Role:** Citizen
- **Status:** ✅ Active
- **Name:** Ben Ali Sami
- **Phone:** +201 234 56

**Citizen Capabilities:**
- Create reports and signalements
- Make donations to campaigns
- View public campaigns
- Track personal reports
- View campaign progress

---

## 🔐 Security Information

### Password Security
- All passwords are set to 8+ characters
- Passwords are hashed using bcrypt (salt rounds: 10)
- JWT tokens expire after 24 hours
- Admin password should be changed after first login

### JWT Configuration
- **Secret:** `changez_moi` (should be changed in production)
- **Algorithm:** HS256
- **Expiration:** 24 hours
- **Issuer:** solidarity-platform

---

## 🚀 Quick Start Guide

### 1. Admin Login
```bash
# Test admin login
curl -X POST http://localhost:5000/api/auth/connexion \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@solidarite.tn","motDePasse":"admin_password_123"}'
```

### 2. Association Login
```bash
# Test association login
curl -X POST http://localhost:5000/api/auth/connexion \
  -H "Content-Type: application/json" \
  -d '{"email":"solidarite@demo.tn","motDePasse":"solidarite123"}'
```

### 3. Citizen Login
```bash
# Test citizen login
curl -X POST http://localhost:5000/api/auth/connexion \
  -H "Content-Type: application/json" \
  -d '{"email":"sami@test.tn","motDePasse":"sami123"}'
```

---

## 📱 Frontend Access

### Application URLs
- **Frontend:** http://localhost:4200/
- **Backend API:** http://localhost:5000/

### Login Process
1. Open browser and navigate to http://localhost:4200/
2. Click "Login" button
3. Enter email and password
4. Select appropriate user type
5. Click "Se connecter"

---

## 🔧 Database Information

### Connection Details
- **Host:** localhost
- **Port:** 5432
- **Database:** solidarite_db
- **User:** postgres
- **Password:** postgrespw

### Tables Used
- `utilisateur` - User accounts and roles
- `association` - Association-specific data
- `citoyen` - Citizen-specific data
- `campagnes` - Donation campaigns
- `signalement` - Reports and issues
- `dons` - Donations
- `document_association` - Legal documents

---

## 📊 Account Statistics

- **Total Users:** 7
- **Admin Users:** 1
- **Association Users:** 3
- **Citizen Users:** 2
- **Approved Associations:** 3
- **Pending Applications:** 0

---

## 🔄 Account Management

### Changing Passwords
1. Admin can reset passwords through the admin panel
2. Users can change passwords through their profile
3. Use the API endpoint: `POST /api/auth/changer-mot-de-passe`

### Managing Associations
1. Admin can approve/reject applications
2. Approved associations can create campaigns
3. Associations can upload legal documents
4. Status tracking: pending → approved → rejected

---

## 🚨 Important Notes

1. **Security:** Change default passwords before production use
2. **Backup:** Regular database backups are recommended
3. **Environment:** These accounts are for testing only
4. **Cleanup:** Remove demo accounts before production deployment
5. **JWT Secret:** Generate a new JWT secret for production

---

## 📞 Support

For account-related issues:
- Check the admin panel at /admin/associations
- Review API documentation
- Check database logs for authentication errors
- Verify CORS configuration for frontend access

---

*Last Updated: November 2026*
*Platform Version: 1.0.0*