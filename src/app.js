var app = angular.module('myApp', []);
app.controller('customersCtrl', ctrlCustomers);
app.controller('CommandsController', ctrlCommands)
var sql = require("mssql");
var http = require('http');
var dateFormat = require('dateformat');
const util = require('util');
var fs = require('fs');
var xml2js = require('xml2js');
var DOMParser = require('xmldom').DOMParser;
const SOAPAction = 'http://microsoft.com/webservices/';
const centralDistinta =
    {
        port: 80,
        path: '/iasws/iasws.asmx',
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': ''
        }
    };
const rastreador =
    {
        id: document.getElementById("vehicleID").value,
        hosts: "10.37.0.26",
        user: "iasws",
        password: "iasws",
    };
var configXML;
const today = new Date();
var flag = false;
var temp;
var last_idseq = -1;
const methodsWS = ["ObtemEventosNormais", "ObtemEventosCtrl"];
var flag = false;
var count = 0;
var cont = 0;
const centrais =
    {
        hosts: [
            "10.37.0.26"
        ]
    };

var commandQueue = [];
var commandQInterval = null;
var setTimeStressCommand = null;
var setTimeCommand = null;
var tagName = null;
var status = null;
var idevent = null;
var dictXML = {};
var garbageXMLCollector = {};
var configDataBase =
    {
        user: 'sa',
        password: '',
        server: '10.40.0.115',
        database: 'dbOmnilink'
    };

/*
*  Init
*/

setInterval(getXMLFiles, 10);

function sendCommand(serialNumber, selectedCommand, flag) {

    var time = 0;

    // multiples commands
    if (flag == 2) {

        commandQInterval = null;

        alert("Enviando Comandos...");

        if (selectedCommand == undefined) {

            alert("Selecione o(s) comando(s)");

        } if (serialNumber.length != 6 || serialNumber == undefined) {
            alert("Número de série inválido ou nulo");
        }
        else {

            if (setTimeCommand == null) {

                setTimeCommand = 10000;
            }

            setTimeStressCommand = setInterval(function () {

                for (let _i = 0; _i < selectedCommand.length; _i++) {

                    var command =
                        {
                            flag: flag,
                            serialNumber: serialNumber,
                            selectedCommand: selectedCommand[_i],
                        }

                    commandQueue.push(command);
                }

            }, setTimeCommand);

            if (commandQInterval == null) {

                commandQInterval = setInterval(consumeCommand, setTimeCommand);
            }
        }
        // send only a command
    } else if (flag == 1) {

        if (selectedCommand == undefined) {

            alert("Selecione o(s) comando(s)");

        } else {

            for (let _i = 0; _i < selectedCommand.length; _i++) {

                var command =
                    {
                        flag: flag,
                        serialNumber: serialNumber,
                        selectedCommand: selectedCommand[_i],
                    }

                commandQueue.push(command)

                if (commandQInterval == null) {

                    commandQInterval = setInterval(consumeCommand, 5000);
                }
            }
        }
        // clear looping commands
    } else if (flag == 3) {

        alert("Pausando comando(s)...");

        if (setTimeStressCommand != null) {

            clearInterval(setTimeStressCommand);

            commandQInterval = 1;
            commandQueue.slice("");

            console.log("Comando(s) pausado(s)");

        } else {

            commandQueue.slice("");
        }

    }
}

function consumeCommand() {
    setTimeout(function () {

        if (commandQueue.length == 0) {

            clearInterval(commandQInterval);

            commandQInterval = null;
            return;
        }
        var command = commandQueue.shift();

        var validateNumber = command.serialNumber.toString();

        var parser = new xml2js.Parser();
        parser.parseString(dictXML[command.selectedCommand], function (err, result) {

            if (command.selectedCommand == "Transmitir Perfil" || command.selectedCommand == "Inibir Apagar FPs" || command.selectedCommand == "Envia Configuracao FP" || command.selectedCommand == "LiberarFPs") {

                switch (command.selectedCommand) {
                    case "Envia Configuracao FP":
                        command.selectedCommand = command.selectedCommand.replace("FP", "")
                            .replace(/\s/g, "");

                        var fp = "Transicoes_";
                        command.selectedCommand = fp + command.selectedCommand.replace(/\s/g, "");
                        break;

                    case "LiberarFPs":
                    case "Inibir Apagar FPs":

                        var fp = "Transicoes_";
                        command.selectedCommand = fp + command.selectedCommand.replace(/\s/g, "");
                        break;

                    case "Transmitir Perfil":
                        command.selectedCommand = 'Operacao_Transmitir_Perfil'
                        console.log(command.selectedCommand);
                        break;

                }

            }

            centralDistinta.headers.SOAPAction = SOAPAction + command.selectedCommand.replace(/\s/g, "");

            try {
                var builder = new xml2js.Builder();
                configXML = builder.buildObject(result); 9

            } catch (err) {
                console.log("Erro inesperado: o erro está sendo corrigido");

            } finally {

                configXML = configXML.replace("user", rastreador.user)
                    .replace("password", rastreador.password)
                    .replace("idvehicle", command.serialNumber);

                if (command.selectedCommand == "Transicoes_EnviaConfiguracao") {
                    configXML = configXML.replace("idFP", solicitaTabelaFPs());
                }

                centralDistinta.hostname = rastreador.hosts;
                var req = http.request(centralDistinta, (res) => {
                    res.setEncoding('utf8');
                    let data = '';
                    res.on('data', d => data += d);
                    res.on('end', () => {
                        parser.parseString(data, function (err, result) {
                            var builder = new xml2js.Builder();

                            try {
                                if (typeof Object.keys(result) !== undefined && Object.keys(result).length > 0) {
                                    var responseWS = builder.buildObject(result);

                                    responseWS = responseWS.replace(/<.*soap.*>/g, "")
                                        .replace(new RegExp("\\&" + "lt;", 'g'), "<")
                                        .replace(new RegExp("\\&" + "gt;", 'g'), ">")
                                        .replace("\n", "");

                                    var parser2 = new DOMParser();
                                    var xmlDoc = parser2.parseFromString(responseWS, "text/xml");
                                    var idevent = "0";

                                    if (command.selectedCommand == "Transicoes_EnviaConfiguracao" || command.selectedCommand == "Operacao_Transmitir_Perfil") {

                                        try {
                                            if (command.selectedCommand == "Operacao_Transmitir_Perfil") {

                                                tagName = xmlDoc.getElementsByTagName("StsTransmissao")[0];
                                                OperationStatus = tagName.childNodes[0];

                                            } else {

                                                tagName = xmlDoc.getElementsByTagName("StsTransmissao")[0];
                                                status = tagName.childNodes[0];
                                            }

                                        } catch (err) {
                                            console.log("Erro inesperado: Reenviando fp");
                                        }

                                        if (status == 0 || OperationStatus == 6) {

                                            rastreador.id = command.serialNumber;

                                            console.log("Comando " + command.selectedCommand + " enviado com sucesso para o rastreador: ", rastreador.id);
                                            //log.info(today.toLocaleDateString() + ": Comando " + selectedCommand + " enviado com sucesso para o rastreador: ", rastreador.id);

                                            if (command.flag == 1) {

                                                alert("Comando " + command.selectedCommand + " enviado com sucesso para o rastreador ", rastreador.id);
                                            }

                                        }

                                    }

                                    else if (command.selectedCommand != "Transicoes_EnviaConfiguracao") {

                                        try {

                                            tagName = xmlDoc.getElementsByTagName(command.selectedCommand.replace(/\s/g, "") + 'Result')[0];
                                            idevent = tagName.childNodes[0];

                                        } catch (err) {
                                            console.log("Erro inesperado: Reenviando comando");

                                        }

                                        if (idevent != undefined) {

                                            var idseq = parseInt(idevent);

                                            if (idseq > 0 && idseq != undefined) {
                                                rastreador.id = command.serialNumber;

                                                console.log("Comando " + command.selectedCommand + " enviado com sucesso para o rastreador: ", rastreador.id);
                                                //log.info(today.toLocaleDateString() + ": Comando " + selectedCommand + " enviado com sucesso para o rastreador: ", rastreador.id);

                                                if (command.flag == 1) {

                                                    alert("Comando " + command.selectedCommand + " enviado com sucesso para o rastreador ", rastreador.id);
                                                }
                                            }
                                        }

                                    }
                                    else {
                                        console.log(" Erro na requisicao", + idseq)
                                    }
                                }
                                else if (typeof Object.keys(result) === undefined
                                    || Object.keys(result).length < 0) {

                                    console.log(" Timeout requisicao");
                                }
                            } catch (err) {
                                console.log("Erro inesperado: o erro está sendo corrigido");
                            }
                        });
                    });
                });

                req.on('error', (e) => {
                    console.log(` Problema na conexao: ${e.message}`);
                });

                req.write(configXML);
                req.end();
            }
        });
    }, 3000)
}

function solicitaTabelaFPs() {
    var numeroFP = (Math.floor(Math.random() * 8) + 3);

    if (numeroFP == 4)
        numeroFP = numeroFP + 1;

    return numeroFP;
}

function configCentral(central, tempo) {

    if (central.length > 0) {

        rastreador.hosts = '';
        rastreador.hosts = central;
        centralDistinta.path = centralDistinta.path.replace("115", "");

        console.log("central configurada: " + rastreador.hosts);
    }
    else if (central.length == 0) {

        console.log("central default: " + rastreador.hosts);
    }

    if (tempo > 0 && tempo != undefined) {

        setTimeCommand = tempo * 60000;
        console.log("tempo configurado: " + tempo + " minuto(s)");

    }

}

function setFlag(bool) {

    flag = bool;

    var timer =
        setInterval(function () {
            if (flag)
                ProcessaEventos();
        }, 1000);
}

function ProcessaEventos() {

    var configXML;
    for (let _i = 0; _i < methodsWS.length; _i++) {

        fs.readFile('./arquivos_consumidor/' + methodsWS[_i] + '.xml', function (err, data) {

            var parser = new xml2js.Parser();
            parser.parseString(data, function (err, result) {

                var builder = new xml2js.Builder();
                configXML = builder.buildObject(result);

                for (_j = 0; _j < centrais.hosts.length; _j++) {

                    centralDistinta.hostname = centrais.hosts[_j];
                    centralDistinta.headers.SOAPAction = SOAPAction + methodsWS[_i];

                    var req = http.request(centralDistinta, (res) => {
                        res.setEncoding('utf8');
                        let data = '';
                        res.on('data', d => data += d);
                        res.on('end', () => {
                            parser.parseString(data, function (err, result) {

                                var builder = new xml2js.Builder();

                                try {

                                    if (typeof Object.keys(result) !== undefined && Object.keys(result).length > 0) {

                                        var responseWS = builder.buildObject(result);

                                        responseWS = responseWS.replace(/<.*soap.*>/g, "")
                                            .replace(new RegExp("\\&" + "lt;", 'g'), "<")
                                            .replace(new RegExp("\\&" + "gt;", 'g'), ">")
                                            .replace("\n", "")
                                            .replace(/<.*ObtemEventosRespons.*>/g, "");

                                        var parser2 = new DOMParser();
                                        var xmlDoc = parser2.parseFromString(responseWS, "text/xml");

                                        var idevent = "0";

                                        if (methodsWS[_i] == "ObtemEventosCtrl") {

                                            if (xmlDoc.getElementsByTagName("NumeroSequenciaCtrl")[0] != undefined) {

                                                idevent = xmlDoc.getElementsByTagName("NumeroSequenciaCtrl")[0].childNodes[0].nodeValue;
                                                var idseq = parseInt(idevent);
                                                configXML = configXML.replace("<UltimoSequencialCtrl>9999999</UltimoSequencialCtrl>", '<UltimoSequencialCtrl>' + idseq + '</UltimoSequencialCtrl>');

                                                if (idseq != last_idseq) {

                                                    last_idseq = idseq;

                                                    console.log(methodsWS[_i] + " Cosumindo Teleevento: ", idseq++);
                                                    //log1.info(today.toLocaleDateString() + ": " + methodsWS[_i] + " Cosumindo Teleevento: ", idseq++);
                                                }
                                            }
                                        }

                                        else if (methodsWS[_i] == "ObtemEventosNormais") {

                                            if (xmlDoc.getElementsByTagName("NumeroSequencia")[0] != undefined) {

                                                idevent = xmlDoc.getElementsByTagName("NumeroSequencia")[0].childNodes[0].nodeValue;
                                                var idseq = parseInt(idevent);
                                                configXML = configXML.replace("<UltimoSequencial>9999999</UltimoSequencial>", '<UltimoSequencial>' + idseq + '</UltimoSequencial>');

                                                if (idseq != last_idseq) {

                                                    last_idseq = idseq;

                                                    console.log(methodsWS[_i] + " Cosumindo Teleevento: ", idseq++);
                                                    //log1.info(today.toLocaleDateString() + ": " + methodsWS[_i] + " Cosumindo Teleevento: ", idseq++);
                                                }
                                            }
                                        }

                                        else if (typeof Object.keys(result) === undefined || Object.keys(result).length < 0) {

                                            setInterval(function () {
                                                ProcessaEventos();
                                            }, 1000);
                                        }
                                    }
                                } catch (err) {
                                    console.log(" Aguardando resposta");
                                    //log1.info(today.toLocaleDateString() + "  Aguardando resposta");
                                }
                            });
                        });
                    });

                    req.on('error', (e) => {
                        console.log(` Problema na conexao: ${e.message}`);
                        //log.info(today.toLocaleDateString() + ` Problea na conexao: ${e.message}`);
                    });

                    req.write(configXML);
                    req.end();
                }
            });
        });
    }
}


function historic(numberSerie) {

    rastreador.historic = numberSerie;
    sql.close();
    connect();

    var itervalRequest = setInterval(function () {

        rastreador.historic = numberSerie;
        sql.close();
        connect();
        console.log("Atualizando a tabela");

    }, 30000);
}

function ctrlCustomers($scope) {
    $scope.arrayEvent = [];
}

function clear() {
    $scope = angular.element(document.getElementById('ctrl-id')).scope();

    $scope.$apply(function () {
        $scope.arrayEvent = [];
    });
}

function change(VehicleID, Comando, dateEm, dataRec, StatusEnvio, Tentativas) {

    $scope = angular.element(document.getElementById('ctrl-id')).scope();

    switch (StatusEnvio) {
        case 0:
            StatusEnvio = "Enviado e processado com sucesso pelo rastreador";
            break;

        case 1:
            StatusEnvio = "Tentativas de envio esgotadas";
            break;

        case 16:
            StatusEnvio = "Aguardando conexão com o veículo"
            break;

        default:
            StatusEnvio = "Status nao identificado";
            break;
    }

    if (Tentativas == null) {
        Tentativas = 1;
    }

    var date = new Date(dateEm);

    var hour = date.getHours();

    var minutes = (date.getMinutes()).toString();
    if (minutes.length == 1) {
        minutes = '0' + minutes;
    }

    var seconds = (date.getSeconds()).toString();
    if (seconds.length == 1) {
        seconds = '0' + seconds;
    }

    var shortDate = dateFormat(date, "dd/mm/yyyy");
    var fullDate;

    if (hour == 22) {
        fullDate = (shortDate + ' - ' + 00 + ':' + minutes + ':' + seconds);
    }
    else if (hour == 23) {
        fullDate = (shortDate + ' - ' + 01 + ':' + minutes + ':' + seconds);
    } else {
        fullDate = (shortDate + ' - ' + (hour + 2) + ':' + minutes + ':' + seconds);
    }

    $scope.$apply(function () {
        $scope.arrayEvent.push({ idterminal: VehicleID, Comando: Comando, DataHoraEm: fullDate, DataHoraRec: dataRec, StatusEnvio: StatusEnvio, Tentativas: Tentativas });
    });
}

function ctrlCommands($scope) {
    $scope.commands = {};
}

function updateCommandsDict(dictXML) {
    var $scope = angular.element(document.getElementById('cmd-id')).scope();

    $scope.$apply(function () {
        $scope.commands = dictXML;
    });
}

function getXMLFiles() {
    readFiles('./arquivos/', function (filename, content) {
        // Remove .xml extension from filename
        name = filename.replace(".xml", "");

        if (name.length != filename.length) {
            if (dictXML[name] == undefined
                || dictXML[name] != content) {
                dictXML[name] = content;
                updateCommandsDict(dictXML);
            }
        }
    },
        function (err) {
            throw err;
        });
}

function readFiles(dirname, onFileContent, onError) {
    fs.readdir(dirname, function (err, filenames) {
        if (err) {
            onError(err);
            return;
        }

        filenames.forEach(function (filename) {
            fs.readFile(dirname + filename, 'utf-8', function (err, content) {
                if (err) {
                    onError(err);
                    return;
                }
                onFileContent(filename, content);
            });
        });
    });
}

function connect() {

    // connect to your database    
    sql.connect(configDataBase, function (err) {
        if (err) console.log(err);

        // create Request object
        var request = new sql.Request();

        // query to the database and get the records
        request.query(

            'SELECT TOP 50 ttelecomando.idterminal, tmensagem.Descricao AS Comando, ttelecomando.DataHoraRec, ttelecomando.DataHoraEm, ttelecomando.StatusEnvio, ttelecomando.tentativas AS Tentativas ' +
            'FROM ttelecomando, tmensagem ' +
            'WHERE ttelecomando.idterminal = ' + rastreador.historic + ' AND ttelecomando.CodMsg = tmensagem.CodMsg ' +
            'ORDER BY DataHoraEm Desc'

            , function (err, recordset) {
                if (err)

                    if (cont == 0) {
                        alert('Para exibir o histórico insira o número de série');
                        cont++

                    } else
                        if (cont > 0) {
                            console.log('Para exibir o histórico insira o número de série');
                        }

                clear();
                try {
                    for (let i = 0; i < recordset.recordset.length; i++) {

                        change(recordset.recordset[i].idterminal, recordset.recordset[i].Comando, recordset.recordset[i].DataHoraEm, recordset.recordset[i].DataHoraRec, recordset.recordset[i].StatusEnvio, recordset.recordset[i].Tentativas);
                    }
                } catch (err) {

                }
            });
    });
}



