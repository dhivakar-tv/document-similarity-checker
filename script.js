async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'txt') {
    return await file.text();
  }

  if (ext === 'pdf') {
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let text = '';

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ');
    }

    return text;
  }

  if (ext === 'docx') {
    const data = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: data });
    return result.value;
  }

  return '';
}

function preprocess(text) {
  return text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
}

function getPrimarySentence(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const sentences = normalized.match(/[^.!?]+[.!?]*/g) || [normalized];
  const primarySentence = sentences.find(sentence => sentence.trim().length > 0) || normalized;
  return primarySentence.trim();
}

function termFrequency(words) {
  const frequencies = {};
  words.forEach(word => {
    frequencies[word] = (frequencies[word] || 0) + 1;
  });
  return frequencies;
}

function cosineSimilarity(vectorA, vectorB) {
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const key in vectorA) {
    if (vectorB[key]) {
      dot += vectorA[key] * vectorB[key];
    }
    magnitudeA += vectorA[key] ** 2;
  }

  for (const key in vectorB) {
    magnitudeB += vectorB[key] ** 2;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB) || 1);
}

async function compareDocuments() {
  const group1Files = Array.from(document.getElementById('group1').files);
  const group2Files = Array.from(document.getElementById('group2').files);
  const output = document.getElementById('output');

  if (group1Files.length < 2) {
    alert('Group 1 must contain at least 2 documents');
    return;
  }

  if (group2Files.length < 1) {
    alert('Group 2 must contain at least 1 document');
    return;
  }

  output.className = 'result';
  output.innerHTML = '⏳ Processing documents...';

  const docs1 = [];
  const docs2 = [];

  for (const file of group1Files) {
    docs1.push(await extractText(file));
  }

  for (const file of group2Files) {
    docs2.push(await extractText(file));
  }

  const sentences1 = docs1.map(doc => getPrimarySentence(doc));
  const sentences2 = docs2.map(doc => getPrimarySentence(doc));
  const vec1 = sentences1.map(sentence => termFrequency(preprocess(sentence)));
  const vec2 = sentences2.map(sentence => termFrequency(preprocess(sentence)));

  const threshold = 30;
  const allPairs = [];

  for (let i = 0; i < vec1.length; i++) {
    for (let j = 0; j < vec2.length; j++) {
      const score = Math.round(cosineSimilarity(vec1[i], vec2[j]) * 100);

      if (score >= threshold) {
        allPairs.push({
          i,
          j,
          file1: group1Files[i].name,
          file2: group2Files[j].name,
          sentence1: sentences1[i],
          sentence2: sentences2[j],
          score
        });
      }
    }
  }

  allPairs.sort((a, b) => b.score - a.score);

  const usedGroup1 = new Set();
  const usedGroup2 = new Set();
  const finalResults = [];

  for (const pair of allPairs) {
    if (!usedGroup1.has(pair.i) && !usedGroup2.has(pair.j)) {
      usedGroup1.add(pair.i);
      usedGroup2.add(pair.j);
      finalResults.push(pair);
    }
  }

  if (finalResults.length > 0) {
    output.innerHTML = '<b>✅ Similar Documents (Unique Matches)</b><br><br>' + finalResults.map(result => `
      <div class="similar">
        📄 <b>${result.file1}</b> &nbsp; ↔ &nbsp; <b>${result.file2}</b><br>
        Similarity: <b>${result.score}%</b>
        <div style="margin-top:8px;color:#9fb2d1;font-size:13px;line-height:1.6;">
          <div><b>Sentence 1:</b> ${result.sentence1 || 'No readable sentence found'}</div>
          <div><b>Sentence 2:</b> ${result.sentence2 || 'No readable sentence found'}</div>
        </div>
      </div>
    `).join('');
  } else {
    output.className = 'result empty-state';
    output.innerHTML = '❌ No similar documents found above threshold';
  }
}
