const puppeteer = require('puppeteer')
const login = require('./data/password.json')
const clinicas = require('./data/clinicas.json')
const CID10 = require('./data/cid10.json')
const URL = require('./data/urls.json')
const delay = require('delay')
const chalk = require('chalk')
const { DateTime } = require('luxon')
const { defaultMaxListeners } = require('mongodb/lib/apm')


const scrapper = async (milis) => {

  console.log(chalk.bgGreen.bold('► Iniciando a coleta de dados.\n'))
  // Delay em milisegundos, tendencia é prolongar delay de acordo com o horário do dia.
  
  
  //await delay(milis) 

  const browser = await puppeteer.launch({ headless: false, slowMo: 40 , defaultViewport: null})
  const page = await browser.newPage()
  await page.goto(URL.principal, { timeout: 60000, waitUntil: 'networkidle2' })

  await page.waitForSelector('#username\\:username')
  await page.type('#username\\:username', login.username)
  await page.type('#password\\:password', login.password)
  await page.click('#submit')

  let internados = [] 
  let arrObs = [] // Recebe todas observações grandes
  
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
        let tabela = [] // vetor que armazena a tabela ( da primeira pagina)
        let tabela2 = [] // caso tenha mais de uma pagina ( caso tenha mais de uma pagina )        
        let arrObs2 = [] // recebe o valor a ser concatenado
        //Laço que verifica a existencia de multiplas páginas
        await verificaClinica(page, c.codigo) // Ordena clinicas especificas pelo RH
        while (el.classe.length === 39) {
          if (tabela.length === 0) {            
            await page.waitForSelector('#tabelaPainelHospitalar')            
            await page.waitForTimeout(3000)
            tabela = await scrapTable(page)
            arrObs = arrObs.concat(await scrapObs(page))
          }
          await page.waitForSelector(`#${el.id}`)
          await page.click(`#${el.id}`)
          await page.waitForSelector('#tabelaPainelHospitalar')
          await page.waitForTimeout(3000)
          tabela2 = await scrapTable(page) //Faz o scrap da tabela toda
          tabela = tabela.concat(tabela2)
          arrObs2 = await scrapObs(page)
          arrObs = arrObs.concat(arrObs2)
          el = await getElementId(page)
        }

        //Pega o conteudo do scrap ( caso tenha multiplas página svai pro else )
        //Se for uma unica página ele executa o scrap e insere o mesmo em Internados
        //Antes de colocar em internados eu tenho que fazer a substituição, ideal realizar isso por meio de uma função externa.
        if (tabela.length === 0) {
          await page.waitForSelector('#tabelaPainelHospitalar')
          await page.waitForTimeout(3000)
          internados.push(await scrapTable(page))
          arrObs = arrObs.concat(await scrapObs(page))
        } else {
            internados.push(tabela)
        }
        return internados
      })
      .catch((err) => {
        internados.push(null)
      })  

    console.log(chalk.cyan.bold(`► Realizando scrap em ${c.clinica}, ${clinicas.indexOf(c) + 1} de ${clinicas.length}.`))    
  }

  await browser.close()  
  return { internados: internados, texto: arrObs } 
}

//Verifica se a clínica é do tipo que não tem leitos
const verificaClinica = async (page, c) => {
  if(c.codigo > 57 && c.codigo < 60) {
    await page.waitForTimeout(3000)
    await page.waitForSelector("#tabelaPainelHospitalar\\:j_id248")
    await page.waitForTimeout(3000)
    await page.click("#tabelaPainelHospitalar\\:j_id248")
    await page.waitForTimeout(3000)
    let auxURL = page.url()
    auxURL = auxURL.replace('leito+asc','prontuario+asc')
    await page.waitForTimeout(3000)    
    page.goto(auxURL, { delay: 600, timeout: 70000, waitUntil: 'networkidle2',})    
  }
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
  return await page
    .evaluate(() => {
      const list = Array.from(document.querySelectorAll('div.tooltip > div')).map(x => x.innerText)      
      return list
    })
    .catch((err) => null)
}

// Função que formata a tabela
const formatter = async (dados) => {
  let {internados, texto } = dados  
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
            idade_completa: new Date(await dtNascFormat(pct[4])), 
            hd: parseCID10(pct[5]),
            esp: [pct[6]],
            di: new Date(await dataToISO(pct[7])), 
            status: (pct[9].toUpperCase().slice(0, 3) === '00D' ? pct[9].slice(3, 7): pct[9].slice(0, 3)).trim(),                   
            observacao: pct[10] === '' ? '' : await atualizaObs(pct[10], texto)
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

//Função que parseia o CID e coloca a descrição do mesmo
const parseCID10 = (strCID) => {
  let arrCID = strCID.split(' ')
  let arrObj = []  
  for(c of arrCID){    
    arrObj.push(CID10.find(cid => cid.code === c))
  }
  return arrObj
}

//Função que converte a idade completa para dataNascimento 
const dtNascFormat = (dtNasc) => {
  const obj = () => {
    let arr = dtNasc.split(' ')
    let years = 0
    let months = 0
    let days = 0
  
    for(let part of arr){
      if(part.endsWith('A')) years = Number(part.split('A').shift())
      if(part.endsWith('M')) months = Number(part.split('M').shift())
      if(part.endsWith('D')) days = Number(part.split('D').shift())
    }
  
    return {years: years, months: months, days: days}
  }

  let dt = DateTime.now({zone: 'America/Sao_Paulo'})
  let isoNasc = dt.minus(obj(dtNasc))
  
  return isoNasc.toISO()
}

//Função que formata a data de internação
const dataToISO = (dtInt) => {
  //22/06 22:40
  //2021-12-09T13:55:41.000Z
  const d = new Date()
  let anoAtual = Number(d.getFullYear())
  let mesAtual = d.getMonth() + 1

  let diaInt = dtInt.substring(0,2)
  let mesInt = dtInt.substring(3,5)
  let horaInt = dtInt.substring(6,8)
  let minInt = dtInt.substring(9,11)

  if(Number(mesAtual) >= Number(mesInt)){
       
    return `${anoAtual}-${mesInt}-${diaInt}T${horaInt}:${minInt}:00.000Z`
  } else {
    return `${anoAtual - 1}-${mesInt}-${diaInt}T${horaInt}:${minInt}:00.000Z`
  }
}


//recebe uma string e a lista total de observações ( grandes ) executa a substituição
const atualizaObs = async (part, listaObs) => {
  part = part.split('\n').join(' ')
  part = part.toUpperCase()
  if(part.endsWith('...') !== -1) {     
    part = part.trim().replace('...', '')
    for(obs of listaObs) {      
      obs = obs.trim().split('\n').join(' ')        
      if(obs.replaceAll(' ', '').indexOf(part.replaceAll(' ', '')) !== -1)     
        part = obs      
    }
    return part
  } else {
    return part
  }  
}

module.exports = { scrapper, formatter }

