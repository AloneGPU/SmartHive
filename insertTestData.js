import mysql from 'mysql2';

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '2006520Zlt',
  database: 'tmp'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  
  // Insert some test data into tmp table
  const testData = [
    { wd: 25.5, sd: 45.2, time: new Date(Date.now() - 300000) }, // 5 minutes ago
    { wd: 26.1, sd: 46.8, time: new Date(Date.now() - 180000) }, // 3 minutes ago
    { wd: 25.8, sd: 47.5, time: new Date(Date.now() - 60000) },  // 1 minute ago
    { wd: 26.3, sd: 48.2, time: new Date(Date.now() - 30000) },  // 30 seconds ago
    { wd: 25.9, sd: 46.9, time: new Date() }                     // Now
  ];
  
  // Clear existing data first
  connection.query('TRUNCATE TABLE tmp', (err) => {
    if (err) {
      console.error('Error truncating tmp table:', err);
      connection.end();
      return;
    }
    
    console.log('Cleared existing data from tmp table');
    
    // Insert test data
    testData.forEach((data, index) => {
      connection.query(
        'INSERT INTO tmp (wd, sd, time) VALUES (?, ?, ?)',
        [data.wd, data.sd, data.time],
        (err, result) => {
          if (err) {
            console.error(`Error inserting test data #${index + 1}:`, err);
          } else {
            console.log(`Inserted test data #${index + 1}: wd=${data.wd}, sd=${data.sd}`);
          }
          
          // Close connection after last insertion
          if (index === testData.length - 1) {
            connection.end();
            console.log('Test data insertion completed');
          }
        }
      );
    });
  });
});
