import mysql from 'mysql2/promise';

// Create a connection without specifying database first
const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '2006520Zlt'
});

try {
  console.log('Connected to MySQL server');
  
  // Show all databases
  console.log('\n=== DATABASES ===');
  const [databases] = await connection.execute('SHOW DATABASES');
  databases.forEach((db, index) => {
    console.log(`${index + 1}. ${db.Database}`);
  });
  
  // Try to find the tmp table in each database
  for (const db of databases) {
    const dbName = db.Database;
    try {
      await connection.execute(`USE ${dbName}`);
      const [tables] = await connection.execute('SHOW TABLES');
      
      // Check if tmp table exists in this database
      const hasTmpTable = tables.some(table => table[`Tables_in_${dbName}`] === 'tmp');
      if (hasTmpTable) {
        console.log(`\n=== TABLE STRUCTURE FOR 'tmp' IN DATABASE '${dbName}' ===`);
        const [columns] = await connection.execute('DESCRIBE tmp');
        console.log('Columns:');
        columns.forEach(col => {
          console.log(`  ${col.Field}: ${col.Type} (${col.Null === 'YES' ? 'NULL' : 'NOT NULL'})`);
        });
        
        // Show sample data if available
        console.log('\nSample data (latest 5 rows):');
        const [sampleData] = await connection.execute('SELECT * FROM tmp ORDER BY id DESC LIMIT 5');
        if (sampleData.length > 0) {
          sampleData.forEach(row => {
            console.log('  ' + JSON.stringify(row));
          });
        } else {
          console.log('  No data available');
        }
      }
    } catch (error) {
      console.error(`Error checking database ${dbName}:`, error.message);
    }
  }
} catch (error) {
  console.error('Error:', error);
} finally {
  await connection.end();
  console.log('\nConnection closed');
}
