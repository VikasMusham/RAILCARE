/**
 * Train Data Import Script
 * ========================
 * Imports train data from two CSV files:
 * - train_info.csv: Master train data (trainNumber, trainName, source, destination, days)
 * - train_schedule.csv: Train stops/schedule data (stops with fares, times, distances)
 * 
 * Features:
 * - Batch processing (not row-by-row) for performance
 * - Skips duplicates
 * - Logs failures
 * - Creates proper foreign key relationships
 * 
 * Usage: npm run import-trains
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Models
const Train = require('../models/Train');
const TrainStop = require('../models/TrainStop');

// Configuration
const BATCH_SIZE = 1000; // Number of records to insert at once
const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/railmitra';

// File paths
const TRAIN_INFO_FILE = path.join(__dirname, '../../data/train_info.csv');
const TRAIN_SCHEDULE_FILE = path.join(__dirname, '../../data/train_schedule.csv');

// Statistics
const stats = {
  trainsProcessed: 0,
  trainsInserted: 0,
  trainsDuplicate: 0,
  trainsFailed: 0,
  stopsProcessed: 0,
  stopsInserted: 0,
  stopsFailed: 0,
  startTime: null,
  endTime: null
};

// Failed records log
const failedRecords = [];

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

/**
 * Determine train type from name
 */
function getTrainType(trainName) {
  const name = trainName.toUpperCase();
  
  if (name.includes('RAJDHANI')) return 'Rajdhani';
  if (name.includes('SHATABDI')) return 'Shatabdi';
  if (name.includes('JAN SHATABDI') || name.includes('JAN-SHATABDI')) return 'Jan Shatabdi';
  if (name.includes('DURONTO')) return 'Duronto';
  if (name.includes('GARIB RATH') || name.includes('GARIBRATH')) return 'Garib Rath';
  if (name.includes('HUMSAFAR')) return 'Humsafar';
  if (name.includes('TEJAS')) return 'Tejas';
  if (name.includes('VANDE BHARAT') || name.includes('VANDEBHARAT')) return 'Vande Bharat';
  if (name.includes('SUPERFAST') || name.includes('SF')) return 'Superfast';
  if (name.includes('PASSENGER') || name.includes('PASS')) return 'Passenger';
  if (name.includes('LOCAL') || name.includes('SUBURBAN')) return 'Local';
  if (name.includes('SPECIAL') || name.includes('SPL')) return 'Special';
  if (name.includes('MAIL')) return 'Mail';
  if (name.includes('EXPRESS') || name.includes('EXP')) return 'Express';
  
  return 'Express';
}

/**
 * Parse running days from days string
 */
function parseRunningDays(daysString) {
  if (!daysString) return ['Daily'];
  
  const days = daysString.split(',').map(d => d.trim()).filter(d => d);
  return days.length > 0 ? days : ['Daily'];
}

/**
 * Pad train number to 5 digits
 */
function padTrainNumber(num) {
  const number = String(num).replace(/"/g, '').trim();
  return number.padStart(5, '0');
}

/**
 * Parse fare value (handle empty/invalid)
 */
function parseFare(value) {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : Math.round(num);
}

/**
 * Read and parse train_info.csv
 */
async function readTrainInfo() {
  console.log('\n📂 Reading train_info.csv...');
  
  const trains = [];
  
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(TRAIN_INFO_FILE);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let isFirstLine = true;
    let lineNumber = 0;
    
    rl.on('line', (line) => {
      lineNumber++;
      
      // Skip header
      if (isFirstLine) {
        isFirstLine = false;
        return;
      }
      
      try {
        const fields = parseCSVLine(line);
        
        if (fields.length < 5) {
          console.warn(`⚠️  Line ${lineNumber}: Insufficient fields`);
          return;
        }
        
        const [trainNo, trainName, source, destination, days] = fields;
        
        trains.push({
          trainNumber: padTrainNumber(trainNo),
          trainName: trainName.replace(/"/g, '').trim(),
          sourceStation: source.replace(/"/g, '').trim(),
          destinationStation: destination.replace(/"/g, '').trim(),
          runningDays: parseRunningDays(days.replace(/"/g, '')),
          type: getTrainType(trainName),
          isActive: true,
          totalStops: 0
        });
      } catch (err) {
        console.error(`❌ Line ${lineNumber}: Parse error - ${err.message}`);
        failedRecords.push({ file: 'train_info.csv', line: lineNumber, error: err.message });
      }
    });
    
    rl.on('close', () => {
      console.log(`✅ Read ${trains.length} trains from train_info.csv`);
      resolve(trains);
    });
    
    rl.on('error', reject);
  });
}

/**
 * Read and parse train_schedule.csv
 */
async function readTrainSchedule() {
  console.log('\n📂 Reading train_schedule.csv...');
  
  const stops = [];
  
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(TRAIN_SCHEDULE_FILE);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let isFirstLine = true;
    let lineNumber = 0;
    
    rl.on('line', (line) => {
      lineNumber++;
      
      // Skip header
      if (isFirstLine) {
        isFirstLine = false;
        return;
      }
      
      try {
        const fields = parseCSVLine(line);
        
        // SN, Train_No, Station_Code, 1A, 2A, 3A, SL, Station_Name, Route_Number, Arrival_time, Departure_Time, Distance
        if (fields.length < 12) {
          console.warn(`⚠️  Line ${lineNumber}: Insufficient fields (${fields.length})`);
          return;
        }
        
        const [sn, trainNo, stationCode, fare1A, fare2A, fare3A, fareSL, stationName, routeNumber, arrival, departure, distance] = fields;
        
        stops.push({
          trainNumber: padTrainNumber(trainNo),
          stopSequence: parseInt(sn) || 1,
          stationCode: stationCode.replace(/"/g, '').trim().toUpperCase(),
          stationName: stationName.replace(/"/g, '').trim(),
          routeNumber: parseInt(routeNumber) || 1,
          arrivalTime: arrival.replace(/"/g, '').trim() || null,
          departureTime: departure.replace(/"/g, '').trim() || null,
          distance: parseInt(distance) || 0,
          fares: {
            firstAC: parseFare(fare1A),
            secondAC: parseFare(fare2A),
            thirdAC: parseFare(fare3A),
            sleeper: parseFare(fareSL)
          }
        });
        
        if (lineNumber % 50000 === 0) {
          console.log(`   📝 Processed ${lineNumber} lines...`);
        }
      } catch (err) {
        console.error(`❌ Line ${lineNumber}: Parse error - ${err.message}`);
        failedRecords.push({ file: 'train_schedule.csv', line: lineNumber, error: err.message });
      }
    });
    
    rl.on('close', () => {
      console.log(`✅ Read ${stops.length} stops from train_schedule.csv`);
      resolve(stops);
    });
    
    rl.on('error', reject);
  });
}

/**
 * Insert trains in batches
 */
async function insertTrains(trains) {
  console.log('\n🚂 Inserting trains...');
  
  const trainIdMap = new Map(); // Map trainNumber -> ObjectId
  
  for (let i = 0; i < trains.length; i += BATCH_SIZE) {
    const batch = trains.slice(i, i + BATCH_SIZE);
    
    try {
      // Use ordered:false to continue on duplicate errors
      const result = await Train.insertMany(batch, { 
        ordered: false,
        rawResult: true 
      });
      
      stats.trainsInserted += result.insertedCount || batch.length;
      
      // Build ID map from inserted documents
      if (result.insertedIds) {
        for (const [idx, id] of Object.entries(result.insertedIds)) {
          const train = batch[parseInt(idx)];
          if (train) {
            trainIdMap.set(train.trainNumber, id);
          }
        }
      }
    } catch (err) {
      if (err.code === 11000) {
        // Handle duplicate key errors
        const insertedCount = err.result?.nInserted || 0;
        stats.trainsInserted += insertedCount;
        stats.trainsDuplicate += batch.length - insertedCount;
        
        // Still try to get IDs from what was inserted
        if (err.insertedDocs) {
          for (const doc of err.insertedDocs) {
            trainIdMap.set(doc.trainNumber, doc._id);
          }
        }
      } else {
        console.error(`❌ Batch insert error: ${err.message}`);
        stats.trainsFailed += batch.length;
        failedRecords.push({ type: 'train_batch', startIdx: i, error: err.message });
      }
    }
    
    stats.trainsProcessed += batch.length;
    
    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= trains.length) {
      console.log(`   📊 Progress: ${Math.min(i + BATCH_SIZE, trains.length)}/${trains.length} trains`);
    }
  }
  
  // Fetch all train IDs (including any that already existed)
  console.log('\n🔍 Building train ID map...');
  const allTrains = await Train.find({}, { trainNumber: 1 }).lean();
  for (const train of allTrains) {
    trainIdMap.set(train.trainNumber, train._id);
  }
  
  console.log(`✅ Train ID map has ${trainIdMap.size} entries`);
  return trainIdMap;
}

/**
 * Insert stops in batches with foreign key references
 */
async function insertStops(stops, trainIdMap) {
  console.log('\n🛤️  Inserting train stops...');
  
  // Add trainId to each stop
  const stopsWithIds = stops.map(stop => {
    const trainId = trainIdMap.get(stop.trainNumber);
    if (!trainId) {
      stats.stopsFailed++;
      return null;
    }
    return {
      ...stop,
      trainId
    };
  }).filter(Boolean);
  
  console.log(`   📝 ${stopsWithIds.length} stops have valid train references`);
  
  for (let i = 0; i < stopsWithIds.length; i += BATCH_SIZE) {
    const batch = stopsWithIds.slice(i, i + BATCH_SIZE);
    
    try {
      await TrainStop.insertMany(batch, { ordered: false });
      stats.stopsInserted += batch.length;
    } catch (err) {
      if (err.code === 11000) {
        const insertedCount = err.result?.nInserted || 0;
        stats.stopsInserted += insertedCount;
      } else {
        console.error(`❌ Batch insert error: ${err.message}`);
        stats.stopsFailed += batch.length;
        failedRecords.push({ type: 'stop_batch', startIdx: i, error: err.message });
      }
    }
    
    stats.stopsProcessed += batch.length;
    
    if ((i + BATCH_SIZE) % 50000 === 0 || i + BATCH_SIZE >= stopsWithIds.length) {
      console.log(`   📊 Progress: ${Math.min(i + BATCH_SIZE, stopsWithIds.length)}/${stopsWithIds.length} stops`);
    }
  }
}

/**
 * Update train totalStops count
 */
async function updateTrainStopCounts() {
  console.log('\n📊 Updating train stop counts...');
  
  const stopCounts = await TrainStop.aggregate([
    { $group: { _id: '$trainId', count: { $sum: 1 } } }
  ]);
  
  const bulkOps = stopCounts.map(({ _id, count }) => ({
    updateOne: {
      filter: { _id },
      update: { $set: { totalStops: count } }
    }
  }));
  
  if (bulkOps.length > 0) {
    await Train.bulkWrite(bulkOps);
    console.log(`✅ Updated stop counts for ${bulkOps.length} trains`);
  }
}

/**
 * Clear existing data
 */
async function clearExistingData() {
  console.log('\n🗑️  Clearing existing train data...');
  
  const trainCount = await Train.countDocuments();
  const stopCount = await TrainStop.countDocuments();
  
  console.log(`   Found ${trainCount} trains and ${stopCount} stops`);
  
  await Train.deleteMany({});
  await TrainStop.deleteMany({});
  
  console.log('✅ Existing data cleared');
}

/**
 * Print final statistics
 */
function printStats() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 IMPORT STATISTICS');
  console.log('='.repeat(60));
  console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
  console.log('');
  console.log('🚂 TRAINS:');
  console.log(`   Processed: ${stats.trainsProcessed}`);
  console.log(`   Inserted:  ${stats.trainsInserted}`);
  console.log(`   Duplicates: ${stats.trainsDuplicate}`);
  console.log(`   Failed:    ${stats.trainsFailed}`);
  console.log('');
  console.log('🛤️  STOPS:');
  console.log(`   Processed: ${stats.stopsProcessed}`);
  console.log(`   Inserted:  ${stats.stopsInserted}`);
  console.log(`   Failed:    ${stats.stopsFailed}`);
  console.log('='.repeat(60));
  
  if (failedRecords.length > 0) {
    console.log('\n⚠️  FAILED RECORDS:');
    failedRecords.slice(0, 10).forEach(r => {
      console.log(`   ${JSON.stringify(r)}`);
    });
    if (failedRecords.length > 10) {
      console.log(`   ... and ${failedRecords.length - 10} more`);
    }
  }
}

/**
 * Main import function
 */
async function main() {
  stats.startTime = Date.now();
  
  console.log('='.repeat(60));
  console.log('🚂 RAILMITRA TRAIN DATA IMPORT');
  console.log('='.repeat(60));
  
  try {
    // Connect to MongoDB
    console.log('\n🔌 Connecting to MongoDB...');
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check if files exist
    if (!fs.existsSync(TRAIN_INFO_FILE)) {
      throw new Error(`train_info.csv not found at: ${TRAIN_INFO_FILE}`);
    }
    if (!fs.existsSync(TRAIN_SCHEDULE_FILE)) {
      throw new Error(`train_schedule.csv not found at: ${TRAIN_SCHEDULE_FILE}`);
    }
    
    // Clear existing data
    await clearExistingData();
    
    // Read CSV files
    const trains = await readTrainInfo();
    const stops = await readTrainSchedule();
    
    // Insert trains
    const trainIdMap = await insertTrains(trains);
    
    // Insert stops with foreign keys
    await insertStops(stops, trainIdMap);
    
    // Update stop counts
    await updateTrainStopCounts();
    
    stats.endTime = Date.now();
    printStats();
    
    console.log('\n✅ Import completed successfully!');
    
  } catch (err) {
    console.error('\n❌ Import failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the import
main();
