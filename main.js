const fs = require('fs') 
const delay = require('delay')
const moment = require('moment')
const chalk = require('chalk')
const MongoClient = require('mongodb').MongoClient
const uri = 'mongodb://smshacn310:27017'
const { scrapper, formatter } = require('./scrapper.js')

moment.locale('pt-br')

MongoClient.connect(
  uri,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (err, client) => {
    if (err) return console.log(err)
    db = client.db('HMACN_DEV') // coloque o nome do seu DB
  }
);

(async () => {
  let acc = 1
  while (true) {

    let data = await scrapper().catch((err) => err)
    let kanban = await formatter(data) 
        
    // Refatorando 
    
    if (kanban !==null) { 
      // Coleta os valores existentes no banco de dados
      let results = await db.collection('pacientes_internados').find().toArray()
      
      let kanbanOLD = []
      let kanbanNEW = []

      results.forEach(p => {        
        kanbanOLD.push(p.prontuario)
      })      

      kanban.forEach(p => {
        kanbanNEW.push(p.prontuario)
      })
      
      //Filtra os valores diferentes entre uma lista e outra
      const pacientes_removidos = kanbanOLD.filter((p) => !kanbanNEW.includes(p))
      let bufferAlta = ''
      //Remove os dados de pacientes com alta do banco de dados      
      pacientes_removidos.forEach((p, i) =>  {
        db.collection('pacientes_internados').deleteOne({prontuario: p}, (err, obj) => {
          if (err) throw err;
          bufferAlta = bufferAlta + ` ${p}\n`    
        });
      })
      

      
      //Realiza o Replace de dados de pacientes com base no RH dos mesmos
      kanban.forEach(p => {
        db.collection('pacientes_internados').replaceOne({prontuario: p.prontuario}, p ,{upsert: true}, (err, res) => {
          if (err) throw err;
        })
      })

      
      fs.appendFile('log.txt', bufferAlta, (err) => {
        if (err) throw err
        //console.log(chalk.green.bold('► Dados mantidos em arquivo.'))        
      })
      console.log(chalk.bgCyan.bold('► Altas:\n'+ bufferAlta + '\n'))  
      console.log(chalk.bgYellow.bold('► Dados salvos em banco de dados.\n'))
      
    } else {      
      console.log(chalk.bgRed.bold('► Navegador foi fechado, reiniciando processo de coleta.'))
    }
  }
 
})()
