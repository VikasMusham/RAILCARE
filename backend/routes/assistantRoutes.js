/**
 * Assistant Routes with Multer File Uploads
 * Handles assistant registration with document uploads
 */

const express = require('express');
const router = express.Router();
const Assistant = require('../models/Assistant');
const Booking = require('../models/Booking');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadAllDocuments } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// Add assistant task actions (accept/decline endpoints)
const assistantTaskActions = require('./assistantTaskActions');
router.use(assistantTaskActions);

// ============================================
// REGISTRATION WITH FILE UPLOADS (Multer)
// ============================================

/**
 * POST /api/assistants/register-with-docs
 * Register a new assistant with document uploads
 * Uses multipart/form-data
 */
router.post('/register-with-docs', uploadAllDocuments, async (req, res) => {
  try {
    const { name, phone, station, languages } = req.body;

    // Validate required fields
    if (!name || !station) {
      return res.status(400).json({
        success: false,
        message: 'Name and station are required'
      });
    }

    // Parse languages (could be JSON string or comma-separated)
    let parsedLanguages = [];
    if (languages) {
      try {
        parsedLanguages = JSON.parse(languages);
      } catch {
        parsedLanguages = languages.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    // Check for duplicate by phone or name+station
    if (phone) {
      const existingByPhone = await Assistant.findOne({ phone });
      if (existingByPhone) {
        return res.status(400).json({
          success: false,
          message: 'An assistant with this phone number already exists'
        });
      }
    }
    const existingByNameStation = await Assistant.findOne({ name, station });
    if (existingByNameStation) {
      return res.status(400).json({
        success: false,
        message: 'An assistant with this name and station already exists'
      });
    }

    // Get file paths from uploaded files
    const files = req.files || {};

    // Save assistant with normalized station_code and document file paths
    const aadharFile = files.aadhar?.[0];
    const panFile = files.pan?.[0];
    const photoFile = files.photo?.[0];
    const assistant = new Assistant({
      name: name.trim(),
      phone: phone?.trim() || null,
      station: station.trim(),
      languages: parsedLanguages,
      aadharFilePath: aadharFile ? `/uploads/aadhar/${aadharFile.filename}` : null,
      panFilePath: panFile ? `/uploads/pan/${panFile.filename}` : null,
      photoFilePath: photoFile ? `/uploads/photos/${photoFile.filename}` : null,
      status: 'active',
      verified: false,
      documentsVerified: false,
      isEligibleForBookings: false
    });

    // Try to link to logged-in user if token present
    try {
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
          const jwt = require('jsonwebtoken');
          const { SECRET } = require('../middleware/auth');
          const payload = jwt.verify(parts[1], SECRET);
          if (payload && payload.id) {
            assistant.userId = String(payload.id);
          }
        }
      }
    } catch (e) {
      // Ignore token errors
    }

    await assistant.save();

    console.log('[Assistant] Registered with docs:', {
      id: assistant._id,
      name: assistant.name,
      aadhar: assistant.aadharFilePath,
      pan: assistant.panFilePath,
      photo: assistant.photoFilePath
    });

    res.status(201).json({
      success: true,
      message: 'Assistant registered successfully',
      assistant
    });
  } catch (err) {
    console.error('[Assistant] Registration error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
});

/**
 * POST /api/assistants/:id/upload-documents
 * Upload documents for an existing assistant
 */
router.post('/:id/upload-documents', uploadAllDocuments, async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) {
      return res.status(404).json({
        success: false,
        message: 'Assistant not found'
      });
    }

    const files = req.files || {};
    const aadharFile = files.aadhar?.[0];
    const panFile = files.pan?.[0];
    const photoFile = files.photo?.[0];

    if (!aadharFile && !panFile && !photoFile) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one document to upload'
      });
    }

    // Update file paths (only for uploaded files)
    if (aadharFile) {
      // Delete old file if exists
      if (assistant.aadharFilePath) {
        const oldPath = path.join(__dirname, '..', assistant.aadharFilePath);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      assistant.aadharFilePath = `/uploads/aadhar/${aadharFile.filename}`;
    }

    if (panFile) {
      if (assistant.panFilePath) {
        const oldPath = path.join(__dirname, '..', assistant.panFilePath);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      assistant.panFilePath = `/uploads/pan/${panFile.filename}`;
    }

    if (photoFile) {
      if (assistant.photoFilePath) {
        const oldPath = path.join(__dirname, '..', assistant.photoFilePath);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      assistant.photoFilePath = `/uploads/photos/${photoFile.filename}`;
    }

    // Reset verification on new uploads
    assistant.documentsVerified = false;
    assistant.documentsRemark = '';

    await assistant.save();

    console.log('[Assistant] Documents uploaded:', {
      id: assistant._id,
      aadhar: assistant.aadharFilePath,
      pan: assistant.panFilePath,
      photo: assistant.photoFilePath
    });

    res.json({
      success: true,
      message: 'Documents uploaded successfully',
      assistant
    });
  } catch (err) {
    console.error('[Assistant] Upload error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
});

// ============================================
// LEGACY ROUTES (kept for backward compatibility)
// ============================================

// Register assistant (legacy - without file uploads)
router.post('/register', async (req, res) => {
  try {
    const data = req.body || {};
    
    let userId = null;
    try {
      const h = req.headers['authorization'];
      if (h) {
        const parts = h.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
          const jwt = require('jsonwebtoken');
          const { SECRET } = require('../middleware/auth');
          const payload = jwt.verify(parts[1], SECRET);
          if (payload && payload.id) userId = payload.id;
        }
      }
    } catch (e) { /* ignore */ }

    if (userId) {
      const existing = await Assistant.findOne({ userId: String(userId) });
      if (existing) return res.json({ success: true, assistant: existing, message: 'Already registered' });
    }

    if (data.name && data.station) {
      const dup = await Assistant.findOne({ name: data.name, station: data.station });
      if (dup) return res.json({ success: true, assistant: dup, message: 'Assistant already exists' });
    }

    const a = new Assistant({ ...data, verified: false });
    if (userId) a.userId = String(userId);
    await a.save();
    res.json({ success: true, assistant: a });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all assistants
router.get('/', async (req, res) => {
  const list = await Assistant.find().sort({ createdAt: -1 });
  res.json(list);
});

// ============================================
// SPECIFIC ROUTES (must come BEFORE /:id routes)
// ============================================

/**
 * GET /api/assistants/my-application
 * Get the current user's assistant application status
 */
router.get('/my-application', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[my-application] Looking for userId:', userId);
    const assistant = await Assistant.findOne({ userId: String(userId) });
    
    if (!assistant) {
      console.log('[my-application] No assistant found for userId:', userId);
      return res.json({
        success: true,
        assistant: null,
        applicationStatus: 'Not Applied'
      });
    }

    console.log('[my-application] Found assistant:', assistant._id, 'Status:', assistant.applicationStatus);
    return res.json({
      success: true,
      assistant,
      applicationStatus: assistant.applicationStatus
    });
  } catch (err) {
    console.error('[my-application] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/assistants/dashboard-access
 * Check if user can access assistant dashboard
 */
router.get('/dashboard-access', authenticate, authorize('assistant'), async (req, res) => {
  try {
    const userId = req.user.id;
    const assistant = await Assistant.findOne({ userId: String(userId) });

    if (!assistant) {
      return res.json({
        success: false,
        canAccess: false,
        redirect: '/assistant-apply.html',
        message: 'Please apply to become an assistant',
        applicationStatus: 'Not Applied'
      });
    }

    if (!assistant.hasApplied) {
      return res.json({
        success: false,
        canAccess: false,
        redirect: '/assistant-apply.html',
        message: 'Please complete your application',
        applicationStatus: 'Not Applied'
      });
    }

    if (assistant.applicationStatus === 'Pending') {
      return res.json({
        success: false,
        canAccess: false,
        redirect: '/assistant-status.html',
        message: 'Your application is under review',
        applicationStatus: 'Pending'
      });
    }

    if (assistant.applicationStatus === 'Rejected') {
      return res.json({
        success: false,
        canAccess: false,
        redirect: '/assistant-status.html',
        message: 'Your application was rejected. Please update and reapply.',
        applicationStatus: 'Rejected',
        editableApplication: assistant.editableApplication
      });
    }

    if (assistant.applicationStatus === 'Approved') {
      return res.json({
        success: true,
        canAccess: true,
        applicationStatus: 'Approved',
        assistant
      });
    }

    // Default: cannot access
    return res.json({
      success: false,
      canAccess: false,
      redirect: '/assistant-apply.html',
      applicationStatus: assistant.applicationStatus
    });

  } catch (err) {
    console.error('[dashboard-access] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/assistants/applications
 * Admin: Get all applications with filters
 */
router.get('/applications', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    
    const query = { hasApplied: true };
    if (status && ['Pending', 'Approved', 'Rejected'].includes(status)) {
      query.applicationStatus = status;
    }

    const applications = await Assistant.find(query)
      .sort({ applicationDate: -1 })
      .select('-documents'); // Exclude legacy base64 docs

    return res.json({
      success: true,
      applications,
      count: applications.length
    });
  } catch (err) {
    console.error('[applications] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// DYNAMIC :id ROUTES (must come AFTER specific routes)
// ============================================

// Get single assistant
router.get('/:id', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, assistant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get bookings for assistant
router.get('/:id/bookings', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false });
    // Find all ServiceTasks assigned to this assistant
    // Only show tasks that are actionable (pending or assigned)
    const tasks = await require('../models/ServiceTask').find({
      assignedAssistant: assistant._id,
      status: { $in: ['pending', 'assigned'] }
    }).populate('bookingId');
    // Collect unique bookings
    const bookingsMap = {};
    for (const task of tasks) {
      if (task.bookingId && !bookingsMap[task.bookingId._id]) {
        bookingsMap[task.bookingId._id] = task.bookingId;
      }
    }
    const bookings = Object.values(bookingsMap).sort((a, b) => b.createdAt - a.createdAt);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update assistant
router.put('/:id', authenticate, async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    
    const user = req.user || {};
    const isAdmin = user.role === 'admin';
    const isOwner = user.role === 'assistant' && assistant.userId && 
                    assistant.userId.toString() === (user.id || user._id || '').toString();
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { name, station, languages, verified } = req.body || {};
    if (name !== undefined) assistant.name = name;
    if (station !== undefined) assistant.station = station;
    if (languages !== undefined) {
      assistant.languages = Array.isArray(languages) 
        ? languages 
        : languages.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (verified !== undefined && isAdmin) assistant.verified = Boolean(verified);
    
    await assistant.save();
    res.json({ success: true, assistant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy base64 upload (kept for backward compatibility)
router.post('/:id/upload-json', async (req, res) => {
  try {
    console.log('[Legacy] upload-json hit for assistant', req.params.id);

    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    const { aadharBase64, aadharName, panBase64, panName } = req.body || {};

    const hasAadhar = Boolean(aadharBase64 && aadharName);
    const hasPan = Boolean(panBase64 && panName);
    
    if (!hasAadhar && !hasPan) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please select at least one document to upload' 
      });
    }

    const uploadsDir = path.join(__dirname, '..', 'uploads', 'assistants', String(assistant._id));
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeWrite = (base64, name) => {
      const buf = Buffer.from(base64, 'base64');
      const fname = Date.now() + '-' + String(name || 'doc').replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const full = path.join(uploadsDir, fname);
      fs.writeFileSync(full, buf);
      return '/uploads/assistants/' + String(assistant._id) + '/' + fname;
    };

    assistant.documents = assistant.documents || {};
    if (hasAadhar) {
      assistant.documents.aadhar = safeWrite(aadharBase64, aadharName);
    }
    if (hasPan) {
      assistant.documents.pan = safeWrite(panBase64, panName);
    }
    
    assistant.documentsVerified = false;
    assistant.documentsRemark = '';

    await assistant.save();
    const fresh = await Assistant.findById(assistant._id);
    
    console.log('[Legacy] Documents saved:', fresh.documents);
    return res.json({ success: true, assistant: fresh });
  } catch (err) {
    console.error('[Legacy] upload-json error:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ============================================
// ADMIN ROUTES (inline for convenience)
// ============================================

// Approve assistant
router.post('/:id/approve', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    assistant.verified = true;
    await assistant.save();
    res.json({ success: true, assistant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reject assistant
router.post('/:id/reject', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false });
    assistant.verified = false;
    await assistant.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify documents
router.post('/:id/verify-docs', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    
    const remark = req.body?.remark ? String(req.body.remark).slice(0, 500) : '';
    assistant.documentsVerified = true;
    if (remark) assistant.documentsRemark = remark;
    await assistant.save();

    // Audit log
    try {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({
        action: 'verify_docs',
        actorId: req.user?.id || req.user?._id,
        actorRole: req.user?.role,
        targetType: 'assistant',
        targetId: String(assistant._id),
        meta: { assistantName: assistant.name, remark }
      });
    } catch (e) {
      console.error('Audit log failed:', e.message);
    }

    return res.json({ success: true, assistant });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Reject documents
router.post('/:id/reject-docs', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    
    const remark = req.body?.remark ? String(req.body.remark).slice(0, 500) : '';
    assistant.documentsVerified = false;
    assistant.documentsRemark = remark || 'Documents rejected by admin';
    await assistant.save();

    return res.json({ success: true, assistant });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// APPLICATION SUBMISSION ROUTE
// ============================================

/**
 * POST /api/assistants/apply
 * Submit a new assistant application (Uber-like onboarding)
 */
router.post('/apply', authenticate, authorize('assistant'), uploadAllDocuments, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if already applied
    let assistant = await Assistant.findOne({ userId: String(userId) });
    
    // Parse request body
    const {
      name,
      phone,
      age,
      station,
      languages,
      permanentAddress,
      yearsOfExperience
    } = req.body;

    // Validate required fields
    if (!name || !phone || !age || !station || !languages) {
      return res.status(400).json({
        success: false,
        message: 'Please fill all required fields: name, phone, age, station, languages'
      });
    }

    // Parse languages
    let parsedLanguages = [];
    if (languages) {
      try {
        parsedLanguages = JSON.parse(languages);
      } catch {
        parsedLanguages = languages.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    if (parsedLanguages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one language'
      });
    }

    // Get uploaded files
    const files = req.files || {};
    const aadharFile = files.aadhar?.[0];
    const panFile = files.pan?.[0];
    const photoFile = files.photo?.[0];

    // Validate required documents for new applications
    if (!assistant) {
      if (!aadharFile || !panFile || !photoFile) {
        return res.status(400).json({
          success: false,
          message: 'Please upload all required documents: Aadhaar, PAN, and Photo'
        });
      }
    }

    if (assistant) {
      // Update existing application (for rejected applications)
      if (!assistant.editableApplication) {
        return res.status(400).json({
          success: false,
          message: 'Your application cannot be edited. Please contact support.'
        });
      }

      // Update fields
      assistant.name = name.trim();
      assistant.phone = phone.trim();
      assistant.age = parseInt(age) || 0;
      assistant.station = station.trim();
      assistant.languages = parsedLanguages;
      assistant.permanentAddress = permanentAddress?.trim() || '';
      assistant.yearsOfExperience = parseInt(yearsOfExperience) || 0;

      // Update documents if new ones uploaded
      if (aadharFile) {
        if (assistant.aadharFilePath) {
          const oldPath = path.join(__dirname, '..', assistant.aadharFilePath);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        assistant.aadharFilePath = `/uploads/aadhar/${aadharFile.filename}`;
      }
      if (panFile) {
        if (assistant.panFilePath) {
          const oldPath = path.join(__dirname, '..', assistant.panFilePath);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        assistant.panFilePath = `/uploads/pan/${panFile.filename}`;
      }
      if (photoFile) {
        if (assistant.photoFilePath) {
          const oldPath = path.join(__dirname, '..', assistant.photoFilePath);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        assistant.photoFilePath = `/uploads/photos/${photoFile.filename}`;
      }

      // Reset to pending on reapplication
      assistant.hasApplied = true;
      assistant.applicationStatus = 'Pending';
      assistant.applicationDate = new Date();
      assistant.rejectionReason = '';
      assistant.documentsVerified = false;
      assistant.documentsRemark = '';

      await assistant.save();

      console.log('[Application] Updated:', assistant._id);

    } else {
      // Create new application
      assistant = new Assistant({
        userId: String(userId),
        name: name.trim(),
        phone: phone.trim(),
        age: parseInt(age) || 0,
        station: station.trim(),
        languages: parsedLanguages,
        permanentAddress: permanentAddress?.trim() || '',
        yearsOfExperience: parseInt(yearsOfExperience) || 0,
        aadharFilePath: aadharFile ? `/uploads/aadhar/${aadharFile.filename}` : null,
        panFilePath: panFile ? `/uploads/pan/${panFile.filename}` : null,
        photoFilePath: photoFile ? `/uploads/photos/${photoFile.filename}` : null,
        hasApplied: true,
        applicationStatus: 'Pending',
        applicationDate: new Date(),
        editableApplication: true,
        verified: false,
        documentsVerified: false
      });

      await assistant.save();
      console.log('[Application] Created:', assistant._id);
    }

    return res.json({
      success: true,
      message: 'Application submitted successfully',
      assistant
    });

  } catch (err) {
    console.error('[apply] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});


/**
 * POST /api/assistants/:id/approve-application
 * Admin: Approve an application
 */
router.post('/:id/approve-application', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    assistant.applicationStatus = 'Approved';
    assistant.approvalDate = new Date();
    assistant.editableApplication = false;
    assistant.verified = true;
    assistant.documentsVerified = true;
    assistant.isEligibleForBookings = true;
    // No stationCode logic needed; only use station
    assistant.rejectionReason = '';
    await assistant.save();

    console.log('[Admin] Approved application:', assistant._id);

    return res.json({
      success: true,
      message: 'Application approved successfully',
      assistant
    });
  } catch (err) {
    console.error('[approve-application] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/assistants/:id/reject-application
 * Admin: Reject an application
 */
router.post('/:id/reject-application', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const { reason, allowReapply = true } = req.body;

    assistant.applicationStatus = 'Rejected';
    assistant.rejectionReason = reason || 'Application rejected by admin';
    assistant.editableApplication = allowReapply;
    assistant.verified = false;

    await assistant.save();

    console.log('[Admin] Rejected application:', assistant._id, 'Reason:', reason);

    return res.json({
      success: true,
      message: 'Application rejected',
      assistant
    });
  } catch (err) {
    console.error('[reject-application] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
