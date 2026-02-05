/**
 * Multer Upload Middleware for RailMitra
 * Handles secure file uploads for Aadhaar, PAN, and Profile Photos
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const uploadDirs = ['uploads/aadhar', 'uploads/pan', 'uploads/photos'];
uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Allowed file types
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf'
};

// File size limit: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Storage configuration for different document types
const createStorage = (subFolder) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, '..', 'uploads', subFolder);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      // Create unique filename: timestamp-originalname
      const ext = ALLOWED_TYPES[file.mimetype] || path.extname(file.originalname).slice(1);
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${ext}`;
      cb(null, uniqueName);
    }
  });
};

// File filter to validate file types
const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: JPG, PNG, PDF`), false);
  }
};

// Create multer instances for different upload types
const aadharStorage = createStorage('aadhar');
const panStorage = createStorage('pan');
const photoStorage = createStorage('photos');

// Single file uploaders
const uploadAadhar = multer({
  storage: aadharStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
}).single('aadhar');

const uploadPan = multer({
  storage: panStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
}).single('pan');

const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
}).single('photo');

// Combined uploader for all three files at once
const uploadAllDocuments = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      let subFolder = 'uploads';
      if (file.fieldname === 'aadhar') subFolder = 'uploads/aadhar';
      else if (file.fieldname === 'pan') subFolder = 'uploads/pan';
      else if (file.fieldname === 'photo') subFolder = 'uploads/photos';
      
      const uploadPath = path.join(__dirname, '..', subFolder);
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = ALLOWED_TYPES[file.mimetype] || path.extname(file.originalname).slice(1);
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${ext}`;
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
}).fields([
  { name: 'aadhar', maxCount: 1 },
  { name: 'pan', maxCount: 1 },
  { name: 'photo', maxCount: 1 }
]);

// Middleware wrapper with error handling
const handleUpload = (uploadFn) => {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            success: false, 
            message: 'File too large. Maximum size is 5MB.' 
          });
        }
        return res.status(400).json({ 
          success: false, 
          message: `Upload error: ${err.message}` 
        });
      } else if (err) {
        return res.status(400).json({ 
          success: false, 
          message: err.message 
        });
      }
      next();
    });
  };
};

module.exports = {
  uploadAadhar: handleUpload(uploadAadhar),
  uploadPan: handleUpload(uploadPan),
  uploadPhoto: handleUpload(uploadPhoto),
  uploadAllDocuments: handleUpload(uploadAllDocuments),
  ALLOWED_TYPES,
  MAX_FILE_SIZE
};
