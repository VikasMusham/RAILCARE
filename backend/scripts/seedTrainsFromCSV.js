/**
 * Train Seed Script from Real CSV Data for RailMitra
 * Run with: node scripts/seedTrainsFromCSV.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';
const CSV_PATH = path.join(__dirname, '..', '..', '..', 'Train_details_22122017.csv');

// Train schema
const trainSchema = new mongoose.Schema({
  trainNumber: { type: String, required: true, unique: true, index: true },
  trainName: { type: String, required: true, index: true },
  from: { type: String, required: true },
  fromCode: { type: String },
  to: { type: String, required: true },
  toCode: { type: String },
  type: { type: String, default: 'Express' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

trainSchema.index({ trainName: 'text', trainNumber: 'text' });

const Train = mongoose.models.Train || mongoose.model('Train', trainSchema);

// Determine train type from name
function getTrainType(trainName) {
  const name = trainName.toUpperCase();
  if (name.includes('RAJDHANI')) return 'Rajdhani';
  if (name.includes('SHATABDI')) return 'Shatabdi';
  if (name.includes('DURONTO')) return 'Duronto';
  if (name.includes('VANDE BHARAT') || name.includes('VANDEBHARAT')) return 'Vande Bharat';
  if (name.includes('TEJAS')) return 'Tejas';
  if (name.includes('GARIB RATH') || name.includes('GARIBRATH')) return 'Garib Rath';
  if (name.includes('HUMSAFAR')) return 'Humsafar';
  if (name.includes('JAN SHATABDI')) return 'Jan Shatabdi';
  if (name.includes('SUPERFAST') || name.includes('SF')) return 'Superfast';
  if (name.includes('MAIL')) return 'Mail';
  if (name.includes('EXPRESS') || name.includes('EXP')) return 'Express';
  if (name.includes('PASSENGER') || name.includes('PASS')) return 'Passenger';
  if (name.includes('LOCAL')) return 'Local';
  if (name.includes('SPECIAL') || name.includes('SPL')) return 'Special';
  return 'Express';
}

// Clean station name (remove JN., JN, etc.)
function cleanStationName(name) {
  if (!name) return '';
  return name
    .replace(/\s+JN\.?$/i, ' Junction')
    .replace(/\s+JN$/i, ' Junction')
    .replace(/\s+CANTT\.?$/i, ' Cantonment')
    .replace(/\s+TERMINUS$/i, ' Terminus')
    .replace(/\s+CITY$/i, ' City')
    .trim();
}

async function parseCSV() {
  console.log('📂 Reading CSV file...');
  console.log('   Path:', CSV_PATH);
  
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV file not found at: ${CSV_PATH}`);
  }
  
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.split('\n');
  
  console.log(`   Total lines: ${lines.length}`);
  
  // Skip header
  const dataLines = lines.slice(1).filter(line => line.trim());
  
  // Map to store unique trains
  const trainMap = new Map();
  
  let processed = 0;
  for (const line of dataLines) {
    // Parse CSV (handle commas in quoted fields)
    const parts = line.split(',');
    
    if (parts.length < 12) continue;
    
    let trainNo = parts[0]?.trim();
    const trainName = parts[1]?.trim();
    const sourceCode = parts[8]?.trim();
    const sourceName = parts[9]?.trim();
    const destCode = parts[10]?.trim();
    const destName = parts[11]?.trim();
    
    // Skip if no train number
    if (!trainNo || trainNo === 'Train No') continue;
    
    // Pad train number to 5 digits with leading zeros
    if (/^\d+$/.test(trainNo) && trainNo.length < 5) {
      trainNo = trainNo.padStart(5, '0');
    }
    
    // Only add first occurrence (unique train)
    if (!trainMap.has(trainNo)) {
      trainMap.set(trainNo, {
        trainNumber: trainNo,
        trainName: trainName || `Train ${trainNo}`,
        from: cleanStationName(sourceName) || sourceCode,
        fromCode: sourceCode,
        to: cleanStationName(destName) || destCode,
        toCode: destCode,
        type: getTrainType(trainName || ''),
        isActive: true
      });
      processed++;
      
      if (processed % 1000 === 0) {
        process.stdout.write(`\r   Parsed ${processed} unique trains...`);
      }
    }
  }
  
  console.log(`\n   Found ${trainMap.size} unique trains`);
  
  return Array.from(trainMap.values());
}

async function seedTrains() {
  try {
    console.log('🚂 RailMitra Train Seeder (Real CSV Data)\n');
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Parse CSV
    const trains = await parseCSV();
    
    if (trains.length === 0) {
      console.log('❌ No trains found in CSV');
      process.exit(1);
    }
    
    // Clear existing trains
    console.log('\n🗑️  Clearing existing trains...');
    const deleted = await Train.deleteMany({});
    console.log(`   Deleted ${deleted.deletedCount} trains`);
    
    // Insert in batches for performance
    console.log('\n📥 Inserting trains (in batches)...');
    const batchSize = 1000;
    let inserted = 0;
    
    for (let i = 0; i < trains.length; i += batchSize) {
      const batch = trains.slice(i, i + batchSize);
      try {
        await Train.insertMany(batch, { ordered: false });
        inserted += batch.length;
        process.stdout.write(`\r   Inserted ${inserted}/${trains.length} trains...`);
      } catch (err) {
        // Handle duplicate key errors (skip them)
        if (err.code === 11000) {
          inserted += batch.length - (err.writeErrors?.length || 0);
        } else {
          console.error('\n   Batch error:', err.message);
        }
      }
    }
    
    // Final count
    const count = await Train.countDocuments();
    console.log(`\n\n✅ Total trains in database: ${count}`);
    
    // Show sample trains
    console.log('\n📋 Sample trains:');
    const samples = await Train.find().limit(15).lean();
    samples.forEach(t => {
      console.log(`   ${t.trainNumber.padEnd(6)} | ${t.trainName.substring(0, 30).padEnd(30)} | ${t.from} → ${t.to}`);
    });
    
    // Show type distribution
    console.log('\n📊 Train type distribution:');
    const types = await Train.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    types.forEach(t => {
      console.log(`   ${t._id.padEnd(15)}: ${t.count}`);
    });
    
    console.log('\n🎉 Train seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

seedTrains();
