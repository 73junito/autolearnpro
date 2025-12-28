const fs = require('fs')
const path = require('path')

function toCsv(rows) {
  if (!rows || rows.length === 0) return ''
  const keys = Object.keys(rows[0])
  const header = keys.join(',')
  const lines = rows.map(r => keys.map(k => {
    const v = r[k]
    if (v === null || v === undefined) return ''
    return '"' + String(v).replace(/"/g, '""') + '"'
  }).join(','))
  return [header, ...lines].join('\n')
}

function main() {
  const dir = path.join(__dirname)
  const inFile = path.join(dir, 'example_mappings.json')
  const outFile = path.join(dir, 'perkins_export.csv')

  if (!fs.existsSync(inFile)) {
    console.error('Input file missing:', inFile)
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync(inFile, 'utf8'))

  // normalize fields to expected export columns
  const rows = data.map(d => ({
    Program: d.program || '',
    Course: d.course || '',
    CompetencyCode: d.competency_code || '',
    CompetencyTitle: d.competency_title || '',
    StandardSource: d.standard_source || '',
    StandardCode: d.standard_code || '',
    StudentID: d.student_id || '',
    AssessmentDate: d.assessment_date || '',
    Score: d.score || '',
    EvidenceURL: d.evidence_url || '',
    CredentialIssued: d.credential_issued ? 'TRUE' : 'FALSE',
    CredentialCode: d.credential_code || ''
  }))

  const csv = toCsv(rows)
  fs.writeFileSync(outFile, csv)
  console.log('Wrote', outFile)
}

if (require.main === module) main()
