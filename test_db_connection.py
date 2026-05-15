import asyncpg
import asyncio

async def test_connection():
    try:
        conn = await asyncpg.connect('postgresql://postgres:Rocky%40237@localhost:5432/NexCore')
        version = await conn.fetchval('SELECT version()')
        print('✓ PostgreSQL connection successful!')
        print(f'✓ Server version: {version[:50]}...')
        
        # Test if database exists
        db_exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = 'NexCore'")
        if db_exists:
            print('✓ Database "NexCore" exists')
        else:
            print('✗ Database "NexCore" does not exist')
        
        await conn.close()
        print('\n✓ Connection test passed!')
        return True
    except Exception as e:
        print(f'✗ Connection failed: {e}')
        return False

if __name__ == '__main__':
    asyncio.run(test_connection())
