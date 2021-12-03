const puppeteer = require('puppeteer')
const login = require('./data/password.json')
const clinicas = require('./data/clinicas.json')
const URL = require('./data/urls.json')
const delay = require('delay')
const chalk = require('chalk')
const { DateTime } = require('luxon')
const { list } = require('mongodb/lib/gridfs/grid_store')

const scrapper = async () => {

  console.log(chalk.bgGreen.bold('► Iniciando a coleta de dados.\n'))
  // Delay em milisegundos, tendencia é prolongar delay de acordo com o horário do dia.
  await delay(3000) 

  const browser = await puppeteer.launch({ headless: false, slowMo: 40 })
  const page = await browser.newPage()
  await page.goto(URL.principal, { timeout: 60000, waitUntil: 'networkidle2' })

  await page.waitForSelector('#username\\:username')
  await page.type('#username\\:username', login.username)
  await page.type('#password\\:password', login.password)
  await page.click('#submit')

  let internados = []

  for (const c of clinicas) {
    await page.goto(URL.selecaoClinica, {
      delay: 600,
      timeout: 70000,
      waitUntil: 'networkidle2',
    })
    await page.waitForSelector('#unidadeFuncionalDecorate\\:unidadeFuncional')
    await page.type('#unidadeFuncionalDecorate\\:unidadeFuncional', c.codigo)
    await page.click('#bt_pesquisar')

    // Sequência de comandos que efetua a coleta dos dados
    await page
      .waitForSelector('#tabelaPainelHospitalar', { timeout: 2000 })
      .then(async () => {
        let el = await getElementId(page)
        let aux = [] // vetor que armazena a tabela ( da primeira pagina)
        let aux2 = [] // caso tenha mais de uma pagina ( caso tenha mais de uma pagina )
        let arrObs = [] // recebe as observaçoes dos pacientes quando existe.

        //Laço que verifica a existencia de multiplas páginas
        while (el.classe.length === 39) {
          if (aux.length === 0) {            
            await page.waitForSelector('#tabelaPainelHospitalar')            
            await page.waitForTimeout(3000)
            aux = await scrapTable(page)
            //arrObs = await scrapObs(page)
          }
          await page.waitForSelector(`#${el.id}`)
          await page.click(`#${el.id}`)
          await page.waitForSelector('#tabelaPainelHospitalar')
          await page.waitForTimeout(3000)
          aux2 = await scrapTable(page) //Faz o scrap da tabela toda          
          aux = aux.concat(aux2)
          el = await getElementId(page)
        }

        if (aux.length === 0) {
          await page.waitForTimeout(3000)          
          internados.push(await scrapTable(page))
        } else {
          internados.push(aux)
        }
        return internados
      })
      .catch((err) => {
        internados.push(null)
      })  

    console.log(chalk.cyan.bold(`► Realizando scrap em ${c.clinica}, ${clinicas.indexOf(c) + 1} de ${clinicas.length}.`))    
  }

  await browser.close()
  return internados
}


// função pra reconhecer se existem mais páginas
const getElementId = async (page) => {
  const result = await page.evaluate(() => {
    let el = document.querySelector('#j_id165')
    if (el === null) el = document.querySelector('#j_id96')
    return { classe: el.className, id: el.id }
  })

  return result
}


// Método que extrai o texto das tabelas
const scrapTable = async (page) => {  
  return await page
    .evaluate(() => {
      const table = Array.from(
        document.querySelectorAll(
          'table[id="tabelaPainelHospitalar"] > tbody > tr '
        )
      )           
      
      return table.map((td) => td.innerText.split('\t'))
    })
    .catch((err) => null)
}

// Método que extrai o texto das Observações ( o conteúdo na integra )
const scrapObs = async (page) => {  //
  return Array.from(document.querySelectorAll('div.tooltip > div')).map(x => x.innerText)
}


// Função que formata a tabela
const formatter = async (internados) => {
  let kanban = []
  let acc = 0

  try {
    for (let clin of internados) {
      if (clin !== null) {
        for (let pct of clin) {
          kanban.push({
            cod: clinicas[acc].codigo,
            clinica: clinicas[acc].clinica,
            leito: (pct[0].slice(1,pct[0].length)) === '000' ? ' - ' : pct[0].slice(1,pct[0].length),
            nome: pct[1],
            prontuario: pct[2],
            genero: pct[3],
            idade: pct[4].slice(0, 3),
            idade_completa: pct[4], // Futuramente corrigir para data_nasc
            hd: pct[5],
            esp: pct[6],
            di: pct[7], // Futuramente adicionar a data com ano, algoritmo mais complexo nesse caso.
            du: pct[8], 
            status: (pct[9].toUpperCase().slice(0, 3) === '00D' ? pct[9].slice(3, 7): pct[9].slice(0, 3)).trim(),       
            observacao: pct[10].split('\n').join(''),            
          })
        }
      } else {     

        console.log(chalk.yellow.bold(`► ${clinicas[acc].clinica} sem internações.`))
      }
      acc++
    }    
    return kanban
  } catch (err) {
    return null
  }
}

module.exports = { scrapper, formatter }

