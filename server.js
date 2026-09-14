const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.post('/api/search', async (req, res) => {
    const { company } = req.body;
    if (!company) return res.status(400).json({ error: 'Company name is required' });
    
    const formattedCompany = company.trim().toLowerCase();

    try {
        // 1. Check if the company is already cached in Supabase
        const { data: cacheHit, error: dbError } = await supabase
            .from('company_cache')
            .select('analysis')
            .eq('company_name', formattedCompany)
            .single();

        if (cacheHit) {
            return res.json({ result: cacheHit.analysis, source: 'database' });
        }

        // 2. Cache Miss: Request a completely free analysis from Gemini 1.5 Flash
        const systemInstruction = "You are an expert corporate sustainability and ESG agent. Analyze the environmental, worker-treatment, and social impact of the searched Indian company. Break down your response into three clear sections: 1. THE GOOD (positive initiatives), 2. THE CONCERNS (ethical/environmental issues), and 3. BUYER VERDICT (a brief summary recommendation). Keep your tone objective.";
        
        const url = `https://googleapis.com{process.env.GEMINI_API_KEY}`;
        
        const geminiResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Analyze the corporate impact of this company: ${company}` }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] }
            })
        });

        const aiData = await geminiResponse.json();
        
        if (!aiData.candidates || aiData.candidates.length === 0) {
            throw new Error('Invalid response from Google AI studio engine');
        }

      const aiText = aiData.candidates[0].content.parts[0].text;

        // 3. Store the result in the database cache for the next user
        await supabase
            .from('company_cache')
            .insert([{ company_name: formattedCompany, original_name: company, analysis: aiText }]);

        return res.json({ result: aiText, source: 'claude' }); // Frontend treats this text seamlessly

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to process company analysis request.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Take5 Free Backend server running on port ${PORT}`));
