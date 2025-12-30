import http from 'http';

const verify = () => {
    http.get('http://localhost:5000/api/plans/available', (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('✅ Status:', res.statusCode);
            try {
                const json = JSON.parse(data);
                console.log('Plans found:', json.count);
                if (json.data) {
                    json.data.forEach(p => console.log(`- ${p.name}: $${p.price}`));
                } else {
                    console.log('Response:', data);
                }
            } catch (e) {
                console.log('Response (not json):', data);
            }
        });

    }).on('error', (err) => {
        console.error('❌ Error:', err.message);
    });
};

verify();
