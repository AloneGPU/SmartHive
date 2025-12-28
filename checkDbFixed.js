import mysql from 'mysql2';

// Create a connection without specifying database first
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '2006520Zlt'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  
  console.log('Connected to MySQL server');
  
  // Show all databases
  connection.query('SHOW DATABASES', (err, databases) => {
    if (err) {
      console.error('Error showing databases:', err);
      connection.end();
      return;
    }
    
    console.log('\n=== DATABASES ===');
    databases.forEach((db, index) => {
      console.log(`${index + 1}. ${db.Database}`);
    });
    
    // Try to use the tmp database directly
    connection.query('USE tmp', (err) => {
      if (err) {
        console.error('Error using database tmp:', err);
        connection.end();
        return;
      }
      
      console.log('\nUsing database: tmp');
      
      // Show all tables in tmp database
      connection.query('SHOW TABLES', (err, tables) => {
        if (err) {
          console.error('Error showing tables:', err);
          connection.end();
          return;
        }
        
        console.log('\n=== TABLES IN DATABASE tmp ===');
        tables.forEach((table, index) => {
          const tableName = Object.values(table)[0];
          console.log(`${index + 1}. ${tableName}`);
        });
        
        // Check the structure of the tmp table if it exists
        connection.query('SHOW TABLES LIKE "tmp"', (err, result) => {
          if (err) {
            console.error('Error checking for tmp table:', err);
            connection.end();
            return;
          }
          
          if (result.length > 0) {
            console.log('\n=== TABLE STRUCTURE FOR tmp ===');
            connection.query('DESCRIBE tmp', (err, columns) => {
              if (err) {
                console.error('Error describing tmp table:', err);
                connection.end();
                return;
              }
              
              console.log('Columns:');
              columns.forEach(col => {
                console.log(`  ${col.Field}: ${col.Type} (${col.Null === 'YES' ? 'NULL' : 'NOT NULL'})`);
              });
              
              // Show sample data
              connection.query('SELECT * FROM tmp ORDER BY id DESC LIMIT 5', (err, sampleData) => {
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
            console.log('\nNo tmp table found in tmp database');
            connection.end();
          }
        });
      });
    });
  });
});
