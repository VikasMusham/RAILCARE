/**
 * Train Seed Script for RailMitra
 * Run with: node scripts/seedTrains.js
 */

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

// Train schema inline (in case model not imported)
const trainSchema = new mongoose.Schema({
  trainNumber: { type: String, required: true, unique: true },
  trainName: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  type: { type: String, default: 'Express' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Train = mongoose.models.Train || mongoose.model('Train', trainSchema);

// Sample train data - Real Indian Railways trains
const trains = [
  // Rajdhani Express Trains
  { trainNumber: '12301', trainName: 'Howrah Rajdhani Express', from: 'New Delhi', to: 'Howrah', type: 'Rajdhani' },
  { trainNumber: '12302', trainName: 'New Delhi Rajdhani Express', from: 'Howrah', to: 'New Delhi', type: 'Rajdhani' },
  { trainNumber: '12309', trainName: 'Rajdhani Express', from: 'Patna', to: 'New Delhi', type: 'Rajdhani' },
  { trainNumber: '12313', trainName: 'Sealdah Rajdhani Express', from: 'New Delhi', to: 'Sealdah', type: 'Rajdhani' },
  { trainNumber: '12431', trainName: 'Trivandrum Rajdhani Express', from: 'New Delhi', to: 'Trivandrum', type: 'Rajdhani' },
  { trainNumber: '12433', trainName: 'Chennai Rajdhani Express', from: 'New Delhi', to: 'Chennai', type: 'Rajdhani' },
  { trainNumber: '12951', trainName: 'Mumbai Rajdhani Express', from: 'New Delhi', to: 'Mumbai Central', type: 'Rajdhani' },
  { trainNumber: '12957', trainName: 'Swarna Jayanti Rajdhani', from: 'New Delhi', to: 'Ahmedabad', type: 'Rajdhani' },
  
  // Shatabdi Express Trains
  { trainNumber: '12001', trainName: 'Bhopal Shatabdi Express', from: 'New Delhi', to: 'Bhopal', type: 'Shatabdi' },
  { trainNumber: '12002', trainName: 'New Delhi Shatabdi Express', from: 'Bhopal', to: 'New Delhi', type: 'Shatabdi' },
  { trainNumber: '12007', trainName: 'Chennai Shatabdi Express', from: 'Mysore', to: 'Chennai', type: 'Shatabdi' },
  { trainNumber: '12009', trainName: 'Ahmedabad Shatabdi Express', from: 'Mumbai Central', to: 'Ahmedabad', type: 'Shatabdi' },
  { trainNumber: '12011', trainName: 'Kalka Shatabdi Express', from: 'New Delhi', to: 'Kalka', type: 'Shatabdi' },
  { trainNumber: '12013', trainName: 'Amritsar Shatabdi Express', from: 'New Delhi', to: 'Amritsar', type: 'Shatabdi' },
  { trainNumber: '12029', trainName: 'Swarna Shatabdi Express', from: 'New Delhi', to: 'Amritsar', type: 'Shatabdi' },
  { trainNumber: '12031', trainName: 'Dehradun Shatabdi Express', from: 'New Delhi', to: 'Dehradun', type: 'Shatabdi' },
  
  // Vande Bharat Express
  { trainNumber: '22435', trainName: 'Vande Bharat Express', from: 'New Delhi', to: 'Varanasi', type: 'Vande Bharat' },
  { trainNumber: '22436', trainName: 'Vande Bharat Express', from: 'Varanasi', to: 'New Delhi', type: 'Vande Bharat' },
  { trainNumber: '22439', trainName: 'Vande Bharat Express', from: 'New Delhi', to: 'Katra', type: 'Vande Bharat' },
  { trainNumber: '20901', trainName: 'Mumbai Vande Bharat', from: 'Mumbai', to: 'Ahmedabad', type: 'Vande Bharat' },
  { trainNumber: '20903', trainName: 'Chennai Vande Bharat', from: 'Chennai', to: 'Mysore', type: 'Vande Bharat' },
  
  // Duronto Express Trains
  { trainNumber: '12213', trainName: 'Delhi Duronto Express', from: 'Mumbai', to: 'New Delhi', type: 'Duronto' },
  { trainNumber: '12259', trainName: 'Sealdah Duronto Express', from: 'New Delhi', to: 'Sealdah', type: 'Duronto' },
  { trainNumber: '12263', trainName: 'Pune Duronto Express', from: 'Hazrat Nizamuddin', to: 'Pune', type: 'Duronto' },
  { trainNumber: '12267', trainName: 'Mumbai Duronto Express', from: 'Ahmedabad', to: 'Mumbai', type: 'Duronto' },
  { trainNumber: '12273', trainName: 'Howrah Duronto Express', from: 'New Delhi', to: 'Howrah', type: 'Duronto' },
  
  // Superfast Express Trains
  { trainNumber: '12615', trainName: 'Grand Trunk Express', from: 'New Delhi', to: 'Chennai', type: 'Superfast' },
  { trainNumber: '12616', trainName: 'Grand Trunk Express', from: 'Chennai', to: 'New Delhi', type: 'Superfast' },
  { trainNumber: '12621', trainName: 'Tamil Nadu Express', from: 'New Delhi', to: 'Chennai', type: 'Superfast' },
  { trainNumber: '12622', trainName: 'Tamil Nadu Express', from: 'Chennai', to: 'New Delhi', type: 'Superfast' },
  { trainNumber: '12627', trainName: 'Karnataka Express', from: 'New Delhi', to: 'Bangalore', type: 'Superfast' },
  { trainNumber: '12628', trainName: 'Karnataka Express', from: 'Bangalore', to: 'New Delhi', type: 'Superfast' },
  { trainNumber: '12723', trainName: 'Telangana Express', from: 'New Delhi', to: 'Hyderabad', type: 'Superfast' },
  { trainNumber: '12724', trainName: 'Telangana Express', from: 'Hyderabad', to: 'New Delhi', type: 'Superfast' },
  { trainNumber: '12649', trainName: 'Karnataka Sampark Kranti', from: 'New Delhi', to: 'Bangalore', type: 'Superfast' },
  { trainNumber: '12650', trainName: 'Karnataka Sampark Kranti', from: 'Bangalore', to: 'New Delhi', type: 'Superfast' },
  
  // Popular Express Trains
  { trainNumber: '12727', trainName: 'Godavari Express', from: 'Hyderabad', to: 'Visakhapatnam', type: 'Express' },
  { trainNumber: '12728', trainName: 'Godavari Express', from: 'Visakhapatnam', to: 'Hyderabad', type: 'Express' },
  { trainNumber: '12841', trainName: 'Coromandel Express', from: 'Howrah', to: 'Chennai', type: 'Superfast' },
  { trainNumber: '12842', trainName: 'Coromandel Express', from: 'Chennai', to: 'Howrah', type: 'Superfast' },
  { trainNumber: '12859', trainName: 'Gitanjali Express', from: 'Mumbai CST', to: 'Howrah', type: 'Superfast' },
  { trainNumber: '12860', trainName: 'Gitanjali Express', from: 'Howrah', to: 'Mumbai CST', type: 'Superfast' },
  { trainNumber: '12903', trainName: 'Golden Temple Mail', from: 'Mumbai CST', to: 'Amritsar', type: 'Mail' },
  { trainNumber: '12904', trainName: 'Golden Temple Mail', from: 'Amritsar', to: 'Mumbai CST', type: 'Mail' },
  { trainNumber: '12925', trainName: 'Paschim Express', from: 'Mumbai', to: 'Amritsar', type: 'Superfast' },
  { trainNumber: '12926', trainName: 'Paschim Express', from: 'Amritsar', to: 'Mumbai', type: 'Superfast' },
  
  // Garib Rath Express
  { trainNumber: '12201', trainName: 'Mumbai Garib Rath', from: 'Mumbai', to: 'Lucknow', type: 'Garib Rath' },
  { trainNumber: '12203', trainName: 'Saharsa Garib Rath', from: 'Amritsar', to: 'Saharsa', type: 'Garib Rath' },
  { trainNumber: '12205', trainName: 'Nanda Devi Garib Rath', from: 'Delhi', to: 'Dehradun', type: 'Garib Rath' },
  
  // Jan Shatabdi Express
  { trainNumber: '12051', trainName: 'Jan Shatabdi Express', from: 'New Delhi', to: 'Chandigarh', type: 'Jan Shatabdi' },
  { trainNumber: '12053', trainName: 'Jan Shatabdi Express', from: 'New Delhi', to: 'Haridwar', type: 'Jan Shatabdi' },
  { trainNumber: '12055', trainName: 'Jan Shatabdi Express', from: 'New Delhi', to: 'Dehradun', type: 'Jan Shatabdi' },
  { trainNumber: '12057', trainName: 'Jan Shatabdi Express', from: 'New Delhi', to: 'Una Himachal', type: 'Jan Shatabdi' },
  
  // Humsafar Express
  { trainNumber: '22119', trainName: 'Mumbai Humsafar Express', from: 'Mumbai', to: 'Katra', type: 'Humsafar' },
  { trainNumber: '22317', trainName: 'Sealdah Humsafar Express', from: 'Sealdah', to: 'Jammu Tawi', type: 'Humsafar' },
  { trainNumber: '22451', trainName: 'Chandigarh Humsafar', from: 'Mumbai', to: 'Chandigarh', type: 'Humsafar' },
  
  // Tejas Express
  { trainNumber: '22119', trainName: 'Mumbai Tejas Express', from: 'Mumbai', to: 'Karmali', type: 'Tejas' },
  { trainNumber: '22121', trainName: 'Delhi Tejas Express', from: 'Lucknow', to: 'Delhi', type: 'Tejas' },
  { trainNumber: '22501', trainName: 'Chennai Tejas Express', from: 'Madurai', to: 'Chennai', type: 'Tejas' },
  
  // South India Trains
  { trainNumber: '12657', trainName: 'Chennai Mail', from: 'Bangalore', to: 'Chennai', type: 'Mail' },
  { trainNumber: '12658', trainName: 'Bangalore Mail', from: 'Chennai', to: 'Bangalore', type: 'Mail' },
  { trainNumber: '12677', trainName: 'Ernakulam Express', from: 'Bangalore', to: 'Ernakulam', type: 'Superfast' },
  { trainNumber: '12678', trainName: 'Bangalore Express', from: 'Ernakulam', to: 'Bangalore', type: 'Superfast' },
  { trainNumber: '12685', trainName: 'Chennai Mangalore Express', from: 'Chennai', to: 'Mangalore', type: 'Superfast' },
  { trainNumber: '12686', trainName: 'Mangalore Chennai Express', from: 'Mangalore', to: 'Chennai', type: 'Superfast' },
  { trainNumber: '16525', trainName: 'Bangalore Kannur Express', from: 'Bangalore', to: 'Kannur', type: 'Express' },
  { trainNumber: '16526', trainName: 'Kannur Bangalore Express', from: 'Kannur', to: 'Bangalore', type: 'Express' },
  
  // East India Trains
  { trainNumber: '12311', trainName: 'Kalka Mail', from: 'Howrah', to: 'Kalka', type: 'Mail' },
  { trainNumber: '12312', trainName: 'Kalka Mail', from: 'Kalka', to: 'Howrah', type: 'Mail' },
  { trainNumber: '12381', trainName: 'Poorva Express', from: 'Howrah', to: 'New Delhi', type: 'Superfast' },
  { trainNumber: '12382', trainName: 'Poorva Express', from: 'New Delhi', to: 'Howrah', type: 'Superfast' },
  { trainNumber: '12505', trainName: 'North East Express', from: 'Guwahati', to: 'New Delhi', type: 'Superfast' },
  { trainNumber: '12506', trainName: 'North East Express', from: 'New Delhi', to: 'Guwahati', type: 'Superfast' },
  
  // West India Trains
  { trainNumber: '12009', trainName: 'Mumbai Ahmedabad Shatabdi', from: 'Mumbai', to: 'Ahmedabad', type: 'Shatabdi' },
  { trainNumber: '12010', trainName: 'Ahmedabad Mumbai Shatabdi', from: 'Ahmedabad', to: 'Mumbai', type: 'Shatabdi' },
  { trainNumber: '12471', trainName: 'Bandra Swaraj Express', from: 'Bandra', to: 'Jammu Tawi', type: 'Superfast' },
  { trainNumber: '12472', trainName: 'Jammu Swaraj Express', from: 'Jammu Tawi', to: 'Bandra', type: 'Superfast' },
  { trainNumber: '12909', trainName: 'Gujarat Superfast', from: 'Bandra', to: 'Ahmedabad', type: 'Superfast' },
  { trainNumber: '12910', trainName: 'Gujarat Superfast', from: 'Ahmedabad', to: 'Bandra', type: 'Superfast' },
  
  // Secunderabad Trains (for Hyderabad area)
  { trainNumber: '12701', trainName: 'Hussainsagar Express', from: 'Secunderabad', to: 'Mumbai CST', type: 'Superfast' },
  { trainNumber: '12702', trainName: 'Hussainsagar Express', from: 'Mumbai CST', to: 'Secunderabad', type: 'Superfast' },
  { trainNumber: '12703', trainName: 'Falaknuma Express', from: 'Secunderabad', to: 'Mumbai CST', type: 'Superfast' },
  { trainNumber: '12704', trainName: 'Falaknuma Express', from: 'Mumbai CST', to: 'Secunderabad', type: 'Superfast' },
  { trainNumber: '12759', trainName: 'Charminar Express', from: 'Hyderabad', to: 'Chennai', type: 'Superfast' },
  { trainNumber: '12760', trainName: 'Charminar Express', from: 'Chennai', to: 'Hyderabad', type: 'Superfast' },
  { trainNumber: '12785', trainName: 'Konark Express', from: 'Secunderabad', to: 'Bhubaneswar', type: 'Superfast' },
  { trainNumber: '12786', trainName: 'Konark Express', from: 'Bhubaneswar', to: 'Secunderabad', type: 'Superfast' },
  
  // Additional Popular Trains
  { trainNumber: '12137', trainName: 'Punjab Mail', from: 'Mumbai CST', to: 'Firozpur', type: 'Mail' },
  { trainNumber: '12138', trainName: 'Punjab Mail', from: 'Firozpur', to: 'Mumbai CST', type: 'Mail' },
  { trainNumber: '12229', trainName: 'Lucknow Mail', from: 'Mumbai CST', to: 'Lucknow', type: 'Mail' },
  { trainNumber: '12230', trainName: 'Lucknow Mail', from: 'Lucknow', to: 'Mumbai CST', type: 'Mail' },
  { trainNumber: '12809', trainName: 'Howrah Mumbai Mail', from: 'Howrah', to: 'Mumbai CST', type: 'Mail' },
  { trainNumber: '12810', trainName: 'Mumbai Howrah Mail', from: 'Mumbai CST', to: 'Howrah', type: 'Mail' },
  { trainNumber: '12939', trainName: 'Pune Jaipur Express', from: 'Pune', to: 'Jaipur', type: 'Superfast' },
  { trainNumber: '12940', trainName: 'Jaipur Pune Express', from: 'Jaipur', to: 'Pune', type: 'Superfast' }
];

async function seedTrains() {
  try {
    console.log('🚂 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    // Clear existing trains
    const deleted = await Train.deleteMany({});
    console.log(`🗑️  Deleted ${deleted.deletedCount} existing trains`);
    
    // Insert new trains
    const result = await Train.insertMany(trains, { ordered: false });
    console.log(`✅ Inserted ${result.length} trains successfully`);
    
    // Show sample
    console.log('\n📋 Sample trains added:');
    const sample = await Train.find().limit(10).lean();
    sample.forEach(t => {
      console.log(`   ${t.trainNumber} - ${t.trainName} (${t.from} → ${t.to})`);
    });
    
    console.log('\n🎉 Train seeding completed!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding trains:', err.message);
    process.exit(1);
  }
}

seedTrains();
