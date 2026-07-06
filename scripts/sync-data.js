const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'data/idioms.json')
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

const targets = [
  {
    path: path.join(root, 'miniprogram/data/idioms.js'),
    content: 'module.exports = ' + JSON.stringify(source) + '\n',
  },
  {
    path: path.join(root, 'cloudfunctions/getDailyIdiom/idioms.json'),
    content: JSON.stringify(source) + '\n',
  },
  {
    path: path.join(root, 'cloudfunctions/manageRoom/idioms.json'),
    content: JSON.stringify(source) + '\n',
  },
  {
    path: path.join(root, 'cloudfunctions/manageRoom/idiom-hints.js'),
    content: fs.readFileSync(path.join(root, 'miniprogram/data/idiom-hints.js'), 'utf8'),
  },
]

const checkOnly = process.argv.includes('--check')
let changed = false

targets.forEach(target => {
  const current = fs.existsSync(target.path) ? fs.readFileSync(target.path, 'utf8') : ''
  if (current !== target.content) {
    changed = true
    if (checkOnly) {
      console.error('Data target is out of sync:', path.relative(root, target.path))
    } else {
      fs.writeFileSync(target.path, target.content)
      console.log('Synced', path.relative(root, target.path))
    }
  }
})

if (checkOnly && changed) {
  console.error('Run `npm run sync:data` to regenerate derived idiom data.')
  process.exit(1)
}

if (!changed) {
  console.log('Idiom data is already in sync.')
}
