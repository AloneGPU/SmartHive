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
  
  console.log('Connected to MySQL server');
  
  // Check if hive_data table exists
  connection.query('SHOW TABLES LIKE "hive_data"', (err, result) => {
    if (err) {
      console.error('Error checking for hive_data table:', err);
      connection.end();
      return;
    }
    
    if (result.length > 0) {
      console.log('\n=== hive_data TABLE EXISTS ===');
      
      // Show table structure
      connection.query('DESCRIBE hive_data', (err, columns) => {
        if (err) {
          console.error('Error describing hive_data table:', err);
          connection.end();
          return;
        }
        
        console.log('Columns:');
        columns.forEach(col => {
          console.log(`  ${col.Field}: ${col.Type} (${col.Null === 'YES' ? 'NULL' : 'NOT NULL'})`);
        });
        
        // Show sample data
        connection.query('SELECT * FROM hive_data ORDER BY id DESC LIMIT 5', (err, sampleData) => {
          if (err) {
            console.error('Error fetching sample data:', err);
            connection.end();
            return;
          }
          
          console.log('\nSample data (latest 5 rows):');
          if (sampleData.length > 0) {
            sampleData.forEach(row => {
              console.log('  ' + JSON.stringify(row));
            });
          } else {
            console.log('  No data available');
          }
          
          connection.end();
        });
      });
    } else {
      console.log('\n=== hive_data TABLE DOES NOT EXIST ===');
      
      // Show all tables in database
      connection.query('SHOW TABLES', (err, tables) => {
        if (err) {
          console.error('Error showing tables:', err);
          connection.end();
          return;
        }
        
        console.log('\nTables in tmp database:');
        tables.forEach((table, index) => {
          const tableName = Object.values(table)[0];
          console.log(`${index + 1}. ${tableName}`);
        });
        
        connection.end();
      });
    }
  });
});
