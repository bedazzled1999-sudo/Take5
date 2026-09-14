const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase Client using environment configurations
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.post('/api/search', async (req, res) => {
    const { company } = req.body;
    if (!company) return res.status(400).json({ error: 'Company name is required' });
    
    const formattedCompany = company.trim().toLowerCase();

    try {
        // 1. Check if the data is already stored in the Supabase Cache
        const { data: cacheHit, error: dbError } = await supabase
            .from('company_cache')
            .select('analysis')
            .eq('company_name', formattedCompany)
            .single();

        if (cacheHit) {
            return res.json({ result: cacheHit.analysis, source: 'database' });
        }

        // 2. Cache Miss: Securely request an analysis from Anthropic's Claude
        const anthropicResponse = await fetch('https://anthropic.com', {
            method: 'POST',
            headers: {
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 1200,
                system: [
                    {
                        type: "text",
                        text: "You are an expert corporate sustainability and ESG agent. Analyze the environmental, worker-treatment, and social impact of the searched Indian company. Break down your response into three clear sections: 1. THE GOOD (positive initiatives), 2. THE CONCERNS (ethical/environmental issues), and 3. BUYER VERDICT (a brief summary recommendation). Keep your tone objective.",
                        cache_control: { type: "ephemeral" }
                    }
                ],
                messages: [{ role: 'user', content: `Analyze the corporate impact of this company: ${company}` }]
            })
        });

        const aiData = await anthropicResponse.json();
        if (!aiData.content || aiData.content.length === 0) {
            throw new Error('Invalid response from AI engine');
        }

        const aiText = aiData.content[0].text;

        // 3. Store the result in the database cache for the next user
        await supabase
            .from('company_cache')
            .insert([{ company_name: formattedCompany, original_name: company, analysis: aiText }]);

        return res.json({ result: aiText, source: 'claude' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to process company analysis request.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Take5 Backend server running on port ${PORT}`));
