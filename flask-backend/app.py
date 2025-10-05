from flask import send_from_directory
import atexit
import base64
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from flask import Flask, request, jsonify, url_for
from flask_socketio import SocketIO, emit
from cs50 import SQL
from flask_cors import CORS
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
import pytz
from pytz import timezone
import os, random
import pandas as pd
from io import BytesIO
import logging
logging.getLogger('matplotlib').setLevel(logging.WARNING)
import subprocess
import requests
import re
from twilio.rest import Client
from dotenv import load_dotenv
import jwt

from werkzeug.utils import secure_filename
var = False
manipule = False
if manipule:
    subprocess.run(['python','manipule.py'])

# Inicialização do app Flask e SocketIO
app = Flask(
    __name__,
    static_folder='/data',      # pasta que vai servir arquivos
    static_url_path='/data'    # endereço para acessar esses arquivos
)

app.config['SECRET_KEY'] = 'seu_segredo_aqui'
socketio = SocketIO(app, cors_allowed_origins="*")  
import shutil

SECRET_KEY = "minha_chave_super_secreta"

load_dotenv()
ACCOUNT_SID = os.getenv("ACCOUNT_SID_TWILIO")
AUTH_TOKEN  = os.getenv("AUTH_TOKEN_TWILIO")
VERIFY_SID  = os.getenv("VERIFY_SID") 

client = Client(ACCOUNT_SID, AUTH_TOKEN)

CORS(
    app,
    resources={r"/*": {"origins": '*'}},
    methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.route("/auth/sms/create", methods=["POST"])
def send_verification():
    print('creatingsms')
    phone = request.json.get("phone")
    v = client.verify.v2.services(VERIFY_SID).verifications.create(to=phone, channel="sms")
    print(v)
    return jsonify({"status": v.status}), 200

@app.route("/auth/sms/check", methods=["POST"])
def check_verification():
    print('verification')
    phone = request.json.get("phone")
    code = request.json.get("code")
    chk = client.verify.v2.services(VERIFY_SID).verification_checks.create(to=phone, code=code)
    print(chk)
    return jsonify({"status": chk.status})  # 'approved' se ok




if var:
    DATABASE_PATH = "/data/dados.db"
    if not os.path.exists(DATABASE_PATH):
        shutil.copy("dados.db", DATABASE_PATH)
    db = SQL("sqlite:///" + DATABASE_PATH)
else:
    db=SQL('sqlite:///data/dados.db')

brazil = timezone('America/Sao_Paulo')

os.makedirs(app.static_folder, exist_ok=True)



# def now_utc_iso():
#     return datetime.now(pytz.utc).isoformat()
# def expires_in_minutes_iso(minutes: int):
#     return (datetime.now(pytz.utc) + timedelta(minutes=minutes)).isoformat()
# def generate_code(n: int = 6) -> str:
#     return f"{random.randint(0, 10**n - 1):0{n}d}"


@app.route("/")
def home():
    return "Aplicação funcionando!", 200

from datetime import datetime, timedelta
from flask import request, jsonify

@app.route('/guardar_login', methods=['POST'])
def guardar_login():
    print('entrou guardar login')
    data = request.get_json(silent=True) or {}
    number = data.get('numero')

    if not number:
        return jsonify({"error": "Campo 'number' é obrigatório."}), 400

    # Busca 1 usuário; evite depender de != 'bloqueado' no WHERE para mensagens claras
    rows = db.execute(
        'SELECT numero, Nome, status FROM clientes WHERE numero = ? LIMIT 1',
        number
    )

    if not rows:
        db.execute('INSERT INTO clientes (numero,Nome,status) VALUES (?,?,?)',number,f'nome:{number}','aprovado')
        rows = [{'numero':number,'Nome':f'nome:{number}','status':'aprovado'}]

    user = rows[0]
    if user.get('status') == 'bloqueado':
        return jsonify({"error": "Usuário bloqueado."}), 403

    payload = {
        "sub": str(user["numero"]),             # subject do token (id/numero)
        "name": user["Nome"],
    }

    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    # PyJWT v2 já retorna str; se for bytes em versões antigas: token = token.decode()

    return jsonify({"authToken": token}), 200


@app.route('/salvarTokenCarg"o', methods=['POST'])
def salvarTokenCargo():
    data = request.get_json()
    username = data.get('username')
    cargo = data.get('cargo')
    token = data.get('token')
    print(f'data {data}, username {username}, token {token}')
    if db.execute('SELECT * FROM tokens WHERE token =?',token):
        db.execute('DELETE FROM tokens WHERE token = ?',token)
    if token and token!='Sem Token':
        db.execute('INSERT INTO tokens (username,cargo,token) VALUES (?,?,?)',username,cargo,token)
    

    return "cargo e user inserido com sucesso"

def enviar_notificacao_expo(cargo,titulo,corpo,token_user,canal="default"):
    print(f'cargo {cargo} titulo, {titulo},corpo {corpo} canal {canal}')
    if cargo:
        tokens = db.execute('SELECT token FROM tokens WHERE cargo = ? AND token != ? GROUP BY token',cargo,'Sem Token')
    else:
        tokens = db.execute('SELECT token FROM tokens WHERE token != ? GROUP BY token','Sem Token')
    tokens = [row for row in tokens if row['token'] != token_user]
    respostas = []
    for row in tokens:
        token = row['token']
        url = "https://exp.host/--/api/v2/push/send"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        payload = {
            "to": token,
            "title": titulo,
            "body": corpo,
            "sound": "default",
            "android_channel_id": canal  # precisa estar igual ao definido no app
        }
        res = requests.post(url, json=payload, headers=headers)
        respostas.append(res.json())  # Armazena o conteúdo da resposta, não o objeto
    print(respostas)
    return respostas



def atualizar_faturamento_diario():
    db.execute('UPDATE usuarios SET liberado = ? WHERE cargo != ?',0,'ADM')
    db.execute('DELETE FROM tokens WHERE cargo!=?','ADM')
    #end_p_dict = db.execute('SELECT itens FROM promotions WHERE dia_end = ?',datetime.now().date())
    # if end_p_dict:  
    #     for row in end_p_dict:
    #         itens = [i.strip() for i in row['itens'].split(',')]
    #         for item in itens:
    #             db.execute('UPDATE pedidos SET preco_atual = preco WHERE item = ?',item)




# Agendador para rodar à meia-noite
scheduler = BackgroundScheduler()
scheduler.add_job(atualizar_faturamento_diario, 'cron', hour=0, minute=5, timezone = brazil)
scheduler.start()

# Garante que o scheduler pare quando encerrar o servidor
atexit.register(lambda: scheduler.shutdown())

@app.route('/opcoes', methods=['POST'])
def opc():
    print('entrou no opcoes')
    data = request.get_json()
    item = data.get('pedido')
    print(item) 
    opcoes = db.execute('SELECT opcoes FROM cardapio WHERE item = ?', item)
    if opcoes:
        palavra = ''
        selecionaveis = []
        dados = []
        for i in opcoes[0]['opcoes']:
            if i == '(':
                nome_selecionavel = palavra
                print(nome_selecionavel)
                palavra = ''
            elif i == '-':
                selecionaveis.append(palavra)
                palavra = ''
            elif i == ')':
                selecionaveis.append(palavra)
                dados.append({nome_selecionavel: selecionaveis})
                selecionaveis = []
                palavra = ''
            else:
                palavra += i
        print(dados)
        return {'options': dados}


@app.route('/pegar_pedidos', methods=['POST'])
def pegar_pedidos():
    # Pegando os dados do JSON enviado na requisição
    data = request.get_json()
    comanda = data.get('comanda')
    ordem = data.get('ordem')
    print(f'ORDEM : {ordem}')
    dia = datetime.now(brazil).date()
    dados = db.execute('''
            SELECT pedido, id, ordem, SUM(quantidade) AS quantidade, SUM(preco) AS preco
            FROM pedidos WHERE comanda = ? AND ordem = ? AND dia = ?
            GROUP BY pedido, (preco/quantidade)
        ''', comanda, int(ordem),dia)
    if int(ordem) != 0:
        return{'data':dados,'preco':''}
    else:
        return{'data':dados,'preco':''}





@app.route('/verificar_username', methods=['POST'])
def verificar_usu():
    data = request.json
    username = data.get('username')
    print(username)
    senha = data.get('senha')
    print(senha)
    existe = db.execute(
        'SELECT * FROM usuarios WHERE username =? AND senha =? AND liberado=?', username, senha, '1')
    if existe:
        print('true')
        return {'data': True, 'cargo': existe[0]['cargo']}
    else:
        print('false')
        return {'data': False}


@app.route('/verificar_quantidade', methods=['POST'])
def verif_quantidade():
    data = request.json  # Use request.json para pegar o corpo da requisição
    item = data.get('item')
    quantidade = data.get('quantidade')

    categoria = db.execute(
        'SELECT categoria_id FROM cardapio WHERE item = ?', item)

    if categoria and categoria[0]['categoria_id'] != 2:
        verificar_estoque = db.execute(
            'SELECT quantidade,estoque_ideal FROM estoque WHERE item = ?', item)

        if verificar_estoque:
            estoque_atual = float(verificar_estoque[0]['quantidade'])
            if estoque_atual - float(quantidade) < 0:
                return {'erro': 'Estoque insuficiente', 'quantidade': estoque_atual}
            elif estoque_atual:
                estoque_ideal = verificar_estoque[0]['estoque_ideal']
                if estoque_ideal:
                    alerta = 7 if item!='tropical' and item!='red bull' else 3
                    if estoque_atual<alerta:
                        return {'erro': False, 'quantidade': estoque_atual}
    return {'erro': False}





@app.route('/changeBrinde', methods=['POST'])
def change_brinde():
    datas = request.json
    data = datas.get('pedido').lower()
    print(data)
    pedidos = db.execute('SELECT item FROM cardapio')
    pedidos_filtrados = []
    cont = 0
    for row in pedidos:
        if cont < 2:
            pedido = row['item']
            if pedido.startswith(data):
                cont += 1
                pedidos_filtrados.append(pedido)
        else:
            break
    return {'data': pedidos_filtrados}



#larissaaa
from flask import send_file
import mimetypes

from flask import send_file
import mimetypes
import os

@app.route('/data/<path:filename>')
def serve_data_file(filename):
    filepath = os.path.join('/data', filename)
    mimetype = mimetypes.guess_type(filepath)[0] or 'image/jpeg'
    return send_file(filepath, mimetype=mimetype)




@app.route('/upload-item-photo', methods=['POST'])
def upload_item_photo():
    if 'photo' not in request.files:
        return jsonify({'error': 'Nenhuma foto enviada'}), 400

    file = request.files['photo']
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.static_folder, filename)
    file.save(filepath)

    # Gera a URL correta para acessar a imagem via /data/uploads/...
    image_url = f"https://flask-backend-server-yxom.onrender.com/data/{filename}"
    print(f"Image URL: {image_url}")

    return jsonify({'imageUrl': image_url}), 200

@app.route('/items-json')
def items_json():
    # busca tudo da tabela itens e retorna como JSON
    registros = db.execute("SELECT * FROM itens")
    return jsonify(registros)


# Manipulador de conexão


@socketio.on('connect')
def handle_connect():
    print(f'Cliente conectado:{request.sid}')


@socketio.on('getCardapio')
def getCardapio(emitirBroadcast):
    dataCardapio = db.execute("SELECT * FROM cardapio")
    emit('respostaCardapio',{'dataCardapio':dataCardapio},broadcast=emitirBroadcast)

@socketio.on('getPedidos')
def getPedidos(emitirBroadcast):
    dia = datetime.now(brazil).date()
    dataPedidos = db.execute('SELECT * FROM pedidos WHERE dia = ?',dia)
    if dataPedidos:
        emit('respostaPedidos',{'dataPedidos':dataPedidos},broadcast=emitirBroadcast)

@socketio.on('getEstoque')
def getEstoque(emitirBroadcast):
    dataEstoque=db.execute('SELECT * FROM estoque')
    if dataEstoque:
        emit('respostaEstoque',{'dataEstoque':dataEstoque},broadcast=emitirBroadcast)

@socketio.on('getEstoqueGeral')
def getEstoqueGeral(emitirBroadcast):
    dataEstoqueGeral=db.execute('SELECT * FROM estoque_geral')
    if dataEstoqueGeral:
        emit('respostaEstoqueGeral',{'dataEstoqueGeral':dataEstoqueGeral},broadcast=emitirBroadcast)


@socketio.on('getComandas')
def getComandas(emitirBroadcast):
    dia = datetime.now(brazil).date()
    dados_comandaAberta = db.execute(
        'SELECT comanda FROM pedidos WHERE ordem = ? AND dia = ? GROUP BY comanda', 0,dia)
    dados_comandaFechada = db.execute(
        'SELECT comanda,ordem FROM pedidos WHERE ordem !=? AND dia = ? GROUP BY comanda', 0,dia)
    if dados_comandaAberta or dados_comandaFechada:
        emit('respostaComandas', {'dados_comandaAberta':dados_comandaAberta,'dados_comandaFechada':dados_comandaFechada},broadcast=emitirBroadcast)


@socketio.on('users')
def users(emitirBroadcast):
    users = db.execute('SELECT * from usuarios')
    emit('usuarios',{'users': users},broadcast=emitirBroadcast)











@socketio.on('disconnect')
def handle_disconnect():
    print('Cliente desconectado')

# Manipulador para inserir dados


@socketio.on('refresh')
def refresh():
    handle_connect()

@socketio.on('EditingEstoque')
def editEstoque(data):
    print('editar estoque')
    tipo = data.get('tipo')
    item = data.get('item')
    novoNome = data.get('novoNome')
    quantidade = data.get('quantidade')
    estoque_ideal = data.get('estoqueIdeal')
    estoque = data.get('estoque')
    usuario = data.get('username')
    token_user = data.get('token')
    print("item", tipo)
    print("item", item)
    print("item", quantidade)
    print("item", estoque_ideal)
    print("estoque", estoque)
    alteracao = f'{item}'
    if not item: emit(f'{estoque}Alterado', {'erro':'Item nao identificado'})
    if tipo == 'Adicionar':
        tipo = 'Adicionou'
        if estoque_ideal:
            alteracao+=f' com estoque ideal de {estoque_ideal}'
        print("Entrou no adicionar")                                            
        if db.execute(f'SELECT item FROM {estoque} WHERE item = ?',item): emit(f'{estoque}Alterado',{'erro':'Nome Igual'})
        db.execute(f"INSERT INTO {estoque} (item,quantidade,estoque_ideal) VALUES (?,?,?)",item,quantidade,estoque_ideal)
    elif tipo == 'Remover':
        tipo='Removeu'
        db.execute(f"DELETE FROM {estoque} WHERE item=?",item)
    else:
        alteracao+=': alterou'
        tipo='Editou'
        antigo = db.execute(f'SELECT estoque_ideal FROM {estoque} WHERE item = ?',item)
        antig = 'inexistente' if not antigo else antigo[0]['estoque_ideal']
        if estoque_ideal and novoNome:
            if type(antig)!=str and int(estoque_ideal) != antig:
                alteracao += f' estoque ideal de {int(antig)} para {float(estoque_ideal)} e {item} para {novoNome}'
            else: alteracao+=f' {item} para {novoNome}'
            
            db.execute(f"UPDATE {estoque} SET item=?, estoque_ideal=? WHERE item=?",novoNome, estoque_ideal,item )
        elif estoque_ideal:
            if type(antig)!=str and int(estoque_ideal) != antig:
                alteracao+= f' estoque ideal de {int(antig)} para {estoque_ideal}'
            db.execute(f"UPDATE {estoque} SET estoque_ideal=? WHERE item=?",estoque_ideal,item)
        elif novoNome:
            alteracao+= f' Nome do {item} para {novoNome}'
            db.execute(f"UPDATE {estoque} SET item=? WHERE item=?",novoNome,item ) 

    insertAlteracoesTable(estoque,alteracao,tipo,f'Botao + no Editar {estoque}',usuario)
    alteracao=f"{usuario} {tipo} {alteracao}"
    enviar_notificacao_expo('ADM','Estoque Editado',alteracao,token_user)

    if estoque=='estoque_geral':
        getEstoqueGeral(True)
    else: getEstoque(True)
            
@socketio.on("editCargo")
def edit_cargo(data):
    print('editcargo')
    usuario=data.get("usuario")
    print (usuario)
    cargo=data.get("cargo")
    print(cargo)
    db.execute("UPDATE usuarios SET cargo = ? WHERE username = ?", cargo, usuario)
    users(True)
    
     



@socketio.on('insert_order')
def handle_insert_order(data):
    try:
        dia = datetime.now(brazil).date()

        comanda = data.get('comanda')
        pedidos = data.get('pedidosSelecionados')
        quantidades = data.get('quantidadeSelecionada')
        horario = data.get('horario')
        username = data.get('username')
        preco = data.get('preco')
        nomes = data.get('nomeSelecionado')
        token_user=data.get('token_user')
        opcoesSelecionadas = data.get('opcoesSelecionadas')
        print(f"opcoesSelecionadas = {opcoesSelecionadas}")
        valorExtra = []
        if opcoesSelecionadas:
            extraSelecionados = data.get('extraSelecionados')
            extra = []

            for j in range(len(extraSelecionados)):
                extras = ''
                print(extraSelecionados)

                # Verifica se todas as opções selecionadas são listas
                if all(isinstance(item, list) for item in opcoesSelecionadas):
                    print('multiplo')
                    chave = ' '.join(opcoesSelecionadas[j])
                    for i in opcoesSelecionadas[j]:
                        if '+' in i:
                            # Separa o item e o preço extra
                            item, precoExtra = i.split('+')
                            precoExtra = int(precoExtra)

                            # Atualiza ou adiciona o preço extra na lista
                            estava = False

                            for key in valorExtra:
                                if pedidos[j]+chave in key:
                                    precoAntigo = key[pedidos[j] +
                                                      chave]
                                    key[pedidos[j]+chave
                                        ] = precoAntigo + precoExtra
                                    estava = True
                                    break

                            if not estava:
                                valorExtra.append(
                                    {pedidos[j]+chave: precoExtra})
                        else:
                            item = i

                        extras += f'{item} '
                else:
                    print('solo')
                    chave = ' '.join(opcoesSelecionadas)
                    for i in opcoesSelecionadas:
                        if '+' in i:
                            item, precoExtra = i.split('+')
                            precoExtra = int(precoExtra)

                            estava = False

                            for key in valorExtra:
                                if pedidos[j]+chave in key:
                                    precoAntigo = key[pedidos[j]+chave]
                                    key[pedidos[j]+chave] = precoAntigo + \
                                        precoExtra
                                    estava = True
                                    break

                            if not estava:
                                valorExtra.append(
                                    {pedidos[j]+chave: precoExtra})
                        else:
                            item = i

                        extras += f'{item} '

                # Adiciona extraSelecionados[j] ao final
                extras += extraSelecionados[j]
                print(extras)
                extra.append(extras)

        else:
            extra = data.get('extraSelecionados')
        print(f'Valor extra: {valorExtra}')
        print(username)
        print(comanda)
        print(pedidos)
        print(quantidades)
        print(horario)
        print(nomes)
        if not nomes:
            nomes = []
            for i in range(len(pedidos)):
                nomes.append('-1')
        for i in range(len(pedidos)):
            pedido = pedidos[i]

            quantidade = quantidades[i]
            preco_unitario = db.execute(
                'SELECT preco,categoria_id FROM cardapio WHERE item = ?', pedido)
            if preco_unitario:
                categoria = preco_unitario[0]['categoria_id']
            else:
                categoria = 4
                print('else')
            if not extra[i]:
                extra[i] = ""
            else:
                extra[i] = extra[i].strip() + ' '
            
            if not nomes[i]:
                nomes[i] = "-1"
            
            print("extra", extra)
            estava = 'a'
            if categoria==3:
                enviar_notificacao_expo('Cozinha','Novo Pedido',f'{quantidade} {pedido} {extra[i]}na {comanda}',token_user)
            elif categoria==2:
                enviar_notificacao_expo('Colaborador','Novo Pedido',f'{quantidade} {pedido} {extra[i]}na {comanda}',token_user)
            
            enviar_notificacao_expo('ADM','Novo Pedido',f'{quantidade} {pedido} {extra[i]}na {comanda}',token_user)
            if preco:
                print('brinde')
                db.execute('INSERT INTO pedidos(comanda, pedido, quantidade,preco,categoria,inicio,estado,extra,username,ordem,nome,dia) VALUES (?, ?, ?,?,?,?,?,?,?,?,?,?)',
                           comanda, pedido, float(quantidade), 0, categoria, horario, 'A Fazer', extra[i], username, 0, nomes[i],dia)
                
            elif not preco_unitario:
                db.execute('INSERT INTO pedidos(comanda, pedido, quantidade,preco,categoria,inicio,estado,extra,username,ordem,nome,dia) VALUES (?, ?, ?,?,?,?,?,?,?,?,?,?)',
                           comanda, pedido, float(quantidade), 0, 4, horario, 'A Fazer', extra[i], username, 0, nomes[i],dia)
                
            elif not valorExtra:
                db.execute('INSERT INTO pedidos(comanda, pedido, quantidade,preco,categoria,inicio,estado,extra,username,ordem,nome,dia) VALUES (?, ?, ?,?,?,?,?,?,?,?,?,?)',
                           comanda, pedido, float(quantidade), float(preco_unitario[0]['preco'])*float(quantidade), categoria, horario, 'A Fazer', extra[i], username, 0, nomes[i],dia)
               
            else:
                brek = False
                contV = -1
                for item in valorExtra:
                    contV += 1
                    if brek:
                        break
                    for cont in range(len(opcoesSelecionadas)):
                        if all(isinstance(ass, list) for ass in opcoesSelecionadas):
                            chave = pedido+' '.join(opcoesSelecionadas[cont])
                        else:
                            chave = pedido+' '.join(opcoesSelecionadas)
                        if chave in item:
                            valor_inserido = float(
                                item[chave]) * float(quantidade)
                            print(
                                f'Inserindo valor {valor_inserido} no pedido {pedido}')
                            db.execute('INSERT INTO pedidos(comanda, pedido, quantidade,preco,categoria,inicio,estado,extra,username,ordem,nome,dia) VALUES (?, ?, ?,?,?,?,?,?,?,?,?,?)',
                                       comanda, pedido, float(quantidade), (float(preco_unitario[0]['preco'])*float(quantidade))+valor_inserido, categoria, horario, 'A Fazer', extra[i], username, 0, nomes[i],dia)
                            estava = 'b'
                            del (valorExtra[contV])
                            brek = True
                            break
                    if estava == 'a':
                        db.execute('INSERT INTO pedidos(comanda, pedido, quantidade,preco,categoria,inicio,estado,extra,username,ordem,nome,dia) VALUES (?, ?, ?,?,?,?,?,?,?,?,?,?)',
                                   comanda, pedido, float(quantidade), float(preco_unitario[0]['preco'])*float(quantidade), categoria, horario, 'A Fazer', extra[i], username, 0, nomes[i],dia)

            quantidade_anterior = db.execute(
                'SELECT quantidade FROM estoque WHERE item = ?', pedido)
            dados_pedido = db.execute('SELECT * FROM pedidos WHERE dia = ?',dia)
            if quantidade_anterior:
                quantidade_nova = float(
                    quantidade_anterior[0]['quantidade']) - quantidade
                db.execute(
                    'UPDATE estoque SET quantidade = ? WHERE item = ?', quantidade_nova, pedido)
                if quantidade_nova < 10:
                    emit('alerta_restantes', {
                         'quantidade': quantidade_nova, 'item': pedido}, broadcast=True)
                getEstoque(True)            
                
            
        faturamento(True)
        handle_get_cardapio(comanda)

    except Exception as e:
        print("Erro ao inserir ordem:", e)
        emit('error', {'message': str(e)})


@socketio.on('faturamento')
def faturamento(data):

    if type(data)!=bool:
        change = data.get('change')
        dia = datetime.now(brazil).date() + timedelta(days=(change))
        dia_formatado = dia.strftime('%d/%m')
        emitir = data.get('emitir')
    else:
        dia = datetime.now(brazil).date()
        emitir = data
        dia_formatado = dia.strftime('%d/%m')
    metodosDict=db.execute("SELECT forma_de_pagamento,SUM(valor) AS valor_total FROM pagamentos WHERE dia =? GROUP BY forma_de_pagamento",dia)
    dinheiro=0
    credito=0
    debito=0
    pix=0
    for row in metodosDict:
        if row["forma_de_pagamento"]=="dinheiro":
            dinheiro+=row["valor_total"]
        elif row["forma_de_pagamento"]=="credito":
            credito+=row["valor_total"]
        elif row["forma_de_pagamento"]=="debito":
            debito+=row["valor_total"]
        elif row["forma_de_pagamento"]=="pix":
            pix+=row["valor_total"]

    # Executar a consulta e pegar o resultado
    faturamentoDict = db.execute('SELECT SUM(valor) AS valor_total,tipo FROM pagamentos WHERE dia = ? GROUP BY tipo',dia)
    caixinha = 0
    dezporcento = 0
    faturamento = 0
    desconto = 0
    for row in faturamentoDict:
        if row['tipo']=='caixinha':
            caixinha += row['valor_total']
        elif row['tipo']=='10%':
            dezporcento += row['valor_total']
        elif row['tipo']=='desconto' :
            desconto += row['valor_total']
        faturamento += row['valor_total']
        faturamento -=desconto
        
    
    
    pedidosQuantDict = db.execute('SELECT SUM(quantidade) AS quantidade_total,SUM(preco) AS preco_total,categoria,preco FROM pedidos WHERE dia = ? GROUP BY categoria ORDER BY categoria ASC',dia)
    drink = 0
    restante = 0
    porcao = 0
    faturamento_previsto = 0
    for row in pedidosQuantDict:
        if row['categoria'] == 1:
            restante = row['quantidade_total']
        elif row['categoria'] == 2:
            drink = row['quantidade_total']
        elif row['categoria'] == 3:
            porcao = row['quantidade_total']
        faturamento_previsto+= row['preco_total']
    pedidos = drink+restante+porcao

    

    emit('faturamento_enviar', {'dia': str(dia_formatado),
                                'faturamento': faturamento,
                                'faturamento_previsto': faturamento_previsto,
                                'drink': drink,
                                'porcao': porcao,
                                "restante": restante,
                                "pedidos": pedidos,
                                "caixinha": caixinha,
                                "dezporcento":dezporcento,
                                "desconto":desconto,
                                "pix":pix,
                                "debito":debito,
                                "credito":credito,
                                "dinheiro":dinheiro
                                },
        broadcast=emitir,
        )
    


@socketio.on('alterarValor')
def alterarValor(data):
    dia = datetime.now(brazil).date()
    valor = float(data.get('valor'))
    tipo = data.get('categoria')
    comanda = data.get('comanda')
    print(tipo)
    print(valor)
        
    db.execute('INSERT INTO pagamentos(valor,comanda,ordem,tipo,dia) VALUES (?,?,?,?,?)',valor,comanda,0,tipo,dia)
    faturamento(True)
    handle_get_cardapio(comanda)



@socketio.on('atualizar_pedidos')
def handle_atualizar_pedidos(data):
    dia = datetime.now(brazil).date()
    p = data.get('pedidoAlterado')
    usuario=data.get('usuario')
    alteracoes=f'{p["pedido"]}, '
    token_user = data.get('token')
    preco = db.execute(
        'SELECT comanda,preco,quantidade,extra,pedido FROM pedidos WHERE id = ? AND dia = ?', p['id'],dia)
    if preco : 
        p2 = preco[0]
        dif={k:(p[k],p2[k]) for k in p.keys() & p2.keys() if p[k]!=p2[k]}.keys()
        for key in dif:
            alteracoes+=f'{key} de {p2[key]} para {p[key]} '
        print(alteracoes)
        db.execute("UPDATE pedidos SET comanda = ?, pedido = ?, quantidade = ?, extra = ?,preco = ? WHERE id = ? AND dia = ?",
               p["comanda"], p["pedido"], p["quantidade"], p["extra"], p["preco"], p["id"],dia)
    insertAlteracoesTable('pedidos',alteracoes,'editou','Tela Pedidos',usuario)
    alteracoes=f'{usuario} Editou {alteracoes}'
    enviar_notificacao_expo('ADM','Pedido Editado',alteracoes,token_user,usuario)
    handle_get_cardapio(str(p["comanda"]))


@socketio.on('desfazer_pagamento')
def desfazer_pagamento(data):
    dia = datetime.now(brazil).date()
    comanda = data.get('comanda')
    db.execute('DELETE FROM pagamentos WHERE comanda = ? AND ordem = ? AND  dia = ?',comanda,1,dia)
    db.execute('UPDATE pagamentos SET ordem = ordem - ? WHERE comanda = ? AND dia = ? AND ordem != ?',1,comanda,dia,0)
    db.execute('UPDATE pedidos SET ordem = ordem - ? WHERE comanda = ? AND dia = ? AND ordem != ?',1,comanda,dia,0)
    faturamento(True)
    handle_get_cardapio(comanda)



@socketio.on('delete_comanda')
def handle_delete_comanda(data):
    try:
        # Identificar a comanda recebida
        if type(data) == str:
            comanda = data
        else:
            comanda = data.get('fcomanda')
            valor_pago = float(data.get('valor_pago'))
            caixinha = data.get('caixinha')
            forma_de_pagamento = data.get('forma_de_pagamento')
            print('forma de pagamento', forma_de_pagamento)
            dia = datetime.now(brazil).date()
            print(f'Data de hoje: {dia}')
            db.execute('UPDATE pagamentos SET ordem = ordem + ? WHERE comanda = ? AND dia = ?',1,comanda,dia)
            db.execute('INSERT INTO pagamentos (valor,tipo,forma_de_pagamento,dia,comanda,ordem) VALUES (?,?,?,?,?,?)',valor_pago,'normal',forma_de_pagamento,dia,comanda,1)
            if caixinha:
                db.execute("INSERT INTO pagamentos (valor,tipo,forma_de_pagamento,dia,ordem,comanda) VALUES (?,?,?,?,?,?)",caixinha,'10%',forma_de_pagamento,dia,1,comanda)

        db.execute('UPDATE pedidos SET ordem = ordem +? WHERE comanda = ? AND dia = ?',1,comanda, dia)
        faturamento(True)
        handle_get_cardapio(comanda)
        emit('comanda_deleted', {'fcomanda': comanda}, broadcast=True)

    except Exception as e:
        print("Erro ao apagar comanda:", e)
        emit('error', {'message': str(e)})


@socketio.on('pagar_parcial')
def pagar_parcial(data):
    comanda = data.get('fcomanda')
    print(f'pagar parcial comanda : {comanda}')
    valor_pago = float(data.get('valor_pago'))
    forma_de_pagamento = data.get('forma_de_pagamento')
    caixinha = data.get('caixinha') 
    
    dia = datetime.now(brazil).date()
    
    totalComandaDict = db.execute('SELECT SUM(preco) AS total FROM pedidos WHERE comanda = ? AND ordem = ? AND dia = ?', comanda, 0,dia)
    valorTotalDict = db.execute('SELECT SUM(valor) as total FROM pagamentos WHERE dia = ? AND comanda = ? AND ordem = ? AND tipo = ?',dia,comanda,1,'normal')
    
    if valorTotalDict and valorTotalDict[0]['total']:
        valorTotal = valorTotalDict[0]['total']
    else:
        valorTotal = 0
    
    db.execute('INSERT INTO pagamentos (valor,tipo,ordem,dia,forma_de_pagamento,comanda) VALUES (?,?,?,?,?,?)',valor_pago,'normal',0,dia,forma_de_pagamento,comanda)
    
    if caixinha:
         db.execute('INSERT INTO pagamentos (valor,tipo,ordem,dia,forma_de_pagamento,comanda) VALUES (?,?,?,?,?,?)',caixinha,'10%',0,dia,forma_de_pagamento,comanda)
    
    if valorTotal+valor_pago>=totalComandaDict[0]['total']:
        db.execute('UPDATE pagamentos SET ordem = ordem + ? WHERE dia = ? AND comanda = ?',1,dia,comanda)
        handle_delete_comanda(comanda)
    
    handle_get_cardapio(comanda)


@socketio.on('get_ingredientes')
def get_ingredientes(data):
    item = data.get('ingrediente')
    ingredientes = db.execute(
        'SELECT instrucoes FROM cardapio WHERE item = ?', item)

    if ingredientes:
        ingrediente = ingredientes[0]['instrucoes']
        data = []
        letras = ''
        key = ''
        dado = ''
        for j in ingrediente:
            if j == ':':
                key = letras
                letras = ''
            elif j == '-':
                dado = letras
                letras = ''
                data.append({'key': key, 'dado': dado})
            else:
                letras += j
        print(data)
        emit('ingrediente', {
             'data': data})


@socketio.on('inserir_preparo')
def inserir_preparo(data):
    id = data.get('id')
    estado = data.get('estado')
    horario = datetime.now(pytz.timezone(
        "America/Sao_Paulo")).strftime('%H:%M')
    dia = datetime.now(brazil).date()

    if estado == 'Pronto':
        db.execute('UPDATE pedidos SET fim = ? WHERE id = ? AND dia = ?', horario, id,dia)
    elif estado == 'Em Preparo':
        db.execute('UPDATE pedidos SET comecar = ? WHERE id = ? AND dia = ?', horario, id,dia)
    
    db.execute('UPDATE pedidos SET estado = ? WHERE id = ? AND dia = ?',estado,
               id, dia)
    getPedidos(True)


@socketio.on('atualizar_estoque_geral')
def atualizar_estoque_geral(data):
    usuario = data.get('username')
    itensAlterados = data.get('itensAlterados')
    token_user = data.get('token')
    for i in itensAlterados:
        item = i['item']
        quantidade = i['quantidade']
        quantidadeAnterior=db.execute("SELECT quantidade FROM estoque_geral WHERE item =?",item)
        if quantidadeAnterior: anterior=quantidadeAnterior[0]['quantidade']
        db.execute('UPDATE estoque_geral SET quantidade = ? WHERE item = ?',
                   float(quantidade), item)
        insertAlteracoesTable('estoque geral',f'{i["item"]} de {int(anterior)} para {i["quantidade"]}','editou','Editar Estoque Geral',usuario)
        enviar_notificacao_expo('ADM','Estoque Geral Atualizado',f'{usuario} Editou {i["item"]} de {int(anterior)} para {i["quantidade"]}',token_user)
    getEstoqueGeral(True)


@socketio.on('atualizar_estoque')
def atualizar_estoque(data):
    usuario = data.get('username')
    itensAlterados = data.get('itensAlterados')
    token_user = data.get('token')
    for i in itensAlterados:
        item = i['item']
        anterior=''
        quantidade = i['quantidade']
        quantidadeAnterior=db.execute("SELECT quantidade FROM estoque WHERE item=?",item)
        if quantidadeAnterior:anterior=quantidadeAnterior[0]['quantidade']
        db.execute('UPDATE estoque SET quantidade = ? WHERE item = ?',
                   float(quantidade), item)
        insertAlteracoesTable('estoque carrinho',f'{i["item"]} de {int(anterior)} para {i["quantidade"]}','editou','Editar Estoque',usuario)
        enviar_notificacao_expo('ADM','Estoque Atualizado',f'{usuario} Editou {i["item"]} de {int(anterior)} para {i["quantidade"]}',token_user)
        
        
    getEstoque(True)


@socketio.on('atualizar_comanda')
def atualizar__comanda(data):
    print(data)
    itensAlterados = data.get('itensAlterados')
    print(itensAlterados)
    comanda = data.get('comanda')
    usuario = data.get('username')
    dia = datetime.now(brazil).date()
    token_user = data.get('token')
    for i in itensAlterados:

        item = i['pedido']
        antes_dic = db.execute('SELECT quantidade FROM pedidos WHERE pedido = ? AND ordem = ? AND dia = ?',item,0,dia)
        antes = antes_dic[0]['quantidade']

        quantidade = float(i['quantidade'])
        print(f'quantidade = {quantidade}')
        if quantidade == 0:
            quantidade_total_dic = db.execute('''SELECT quantidade,id FROM pedidos
            WHERE pedido = ? AND comanda = ? AND ordem = ? AND dia = ?;
                ''', item, comanda,dia, 0)
            quantidade_total = 0
            for j in quantidade_total_dic:
                quantidade_total += float(j['quantidade'])
            verifEstoq = db.execute(
                'SELECT * FROM estoque WHERE item = ?', item)
            if verifEstoq:
                db.execute(
                    'UPDATE estoque SET quantidade = quantidade + ? WHERE item = ?', quantidade_total, item)
                
                insertAlteracoesTable('Pedido Editado',f'{i["pedido"]} de {antes} para {i["quantidade"]}','editou','Editar Comanda',usuario)
                enviar_notificacao_expo('ADM','Comanda Editada',f'{usuario} Editou {i["pedido"]} de {antes} para {i["quantidade"]}',token_user)


            db.execute(
                'DELETE FROM pedidos WHERE pedido = ? AND comanda = ? AND ordem = ? AND dia = ?', item, comanda, 0,dia)
        else:
            print(i['preco'])
            preco = float(i['preco'])/quantidade
            print(f'quantidade {quantidade}')
            print(f'preco {preco}')
            quantidade_total_dic = db.execute('''SELECT quantidade,id FROM pedidos
                WHERE pedido = ? AND comanda = ? AND ordem = ? AND preco / quantidade = ? AND dia = ?;
                    ''', item, comanda, 0, preco,dia)
            quantidade_total = 0
            for j in quantidade_total_dic:
                quantidade_total += float(j['quantidade'])
            quantidade_atualizada = (quantidade_total - quantidade)*-1
            print(f'quantidade atualizada acima {quantidade_atualizada}')
            preco_atualizado = preco*quantidade_atualizada

            if quantidade_atualizada < 0:
                quantidade_atualizada *= -1
                ids = db.execute(
                    'SELECT id,quantidade FROM pedidos WHERE pedido = ? AND comanda = ? AND ordem = ? AND dia = ?', item, comanda, 0,dia)
                verifEstoq = db.execute(
                    'SELECT * FROM estoque WHERE item = ?', item)
                if verifEstoq:
                    db.execute(
                        'UPDATE estoque SET quantidade = quantidade + ? WHERE item = ?', quantidade_atualizada, item)
                insertAlteracoesTable('Pedido Editado',f'{i["pedido"]} de {antes} para {i["quantidade"]} na comanda:{comanda} ','editou','Editar Comanda',usuario)
                enviar_notificacao_expo('ADM','Comanda Editada',f'{usuario} Editou {i["pedido"]} de {antes} para {i["quantidade"]} na comanda:{comanda}',token_user)

                for k in ids:
                    if quantidade_atualizada > 0:
                        print(f'quantidade atualizada {quantidade_atualizada}')
                        print(f'k["quantidade"] {k["quantidade"]}')
                        if float(k['quantidade']) <= quantidade_atualizada:
                            db.execute(
                                'DELETE FROM pedidos WHERE id = ? AND dia = ?', k['id'],dia)
                            quantidade_atualizada -= float(k['quantidade'])
                        else:
                            db.execute(
                                'UPDATE pedidos SET  preco = preco/quantidade * (quantidade - ?),quantidade = quantidade - ? WHERE id = ? AND dia = ?', quantidade_atualizada, quantidade_atualizada, k['id'],dia)
                            quantidade_atualizada -= float(k['quantidade'])

            else:
                print(quantidade_total_dic)
                db.execute('UPDATE pedidos SET quantidade = quantidade + ?,preco = preco + ? WHERE pedido = ? AND comanda = ? AND ordem = ? AND id = ? AND dia = ?',
                           quantidade_atualizada, preco_atualizado, item, comanda, 0, quantidade_total_dic[0]['id'],dia)
                verifEstoq = db.execute(
                    'SELECT * FROM estoque WHERE item = ?', item)
                if verifEstoq:
                    db.execute(
                        'UPDATE estoque SET quantidade = quantidade - ? WHERE item = ?', quantidade_atualizada, item)
                insertAlteracoesTable('Pedido Editado',f'{i["pedido"]} de {antes} para {i["quantidade"]} na comanda:{comanda}','editou','Editar Comanda',usuario)
                enviar_notificacao_expo('ADM','Comanda Editada',f'{usuario} Editou {i["pedido"]} de {antes} para {i["quantidade"]} na comanda:{comanda}',token_user)
            db.execute('''
                            DELETE FROM pedidos
                            WHERE id IN (
                                SELECT id
                                FROM (
                                    SELECT id
                                    FROM pedidos
                                    WHERE comanda = ?
                                    AND ordem = 0
                                    AND dia = ?
                                    GROUP BY pedido
                                    HAVING SUM(quantidade) = 0
                                ) subquery
                            );
                        ''', comanda,dia)
    
    getEstoque(True)
    handle_get_cardapio(comanda)

@socketio.on('transferir_para_estoque_carrinho')
def transferir_para_estoque_carrinho(data):
    itensAlterados = data.get('itensAlterados')
    token = data.get('token')
    usuario = data.get('username')
    for i in itensAlterados:
        
        quantidade_antiga = db.execute('SELECT quantidade FROM estoque_geral WHERE item = ?',i['item'])
        existe_no_estoque = db.execute('SELECT quantidade FROM estoque WHERE item = ?',i['item'])
        if quantidade_antiga and existe_no_estoque:
            quantidade_antig = float(quantidade_antiga[0]['quantidade'])
            quantidade = float(i['quantidade'])
            db.execute('UPDATE estoque SET quantidade = quantidade + ? WHERE item = ?',quantidade_antig-quantidade,i['item'])
            getEstoque(True)
            insertAlteracoesTable('Estoque Carrinho',f'{i["item"]} de {existe_no_estoque[0]["quantidade"]} para {quantidade_antig-quantidade}','editou','Transferir para Estoque Carrinho',usuario)
            enviar_notificacao_expo('ADM','Estoque Carrinho Tranferir',f'{usuario} Editou {i["item"]} de {existe_no_estoque[0]["quantidade"]} para {quantidade_antig-quantidade}',token)
    atualizar_estoque_geral(data)
            

@socketio.on('get_cardapio')
def handle_get_cardapio(data):
    print('get_cardapio')
    try:
        dia = datetime.now(brazil).date()
        if type(data) == str:
            fcomanda = data
            ordem = 0
        else:
            fcomanda = data.get('fcomanda')
            ordem = data.get('ordem')
        if ordem == 0:
            valor_pago = db.execute('SELECT SUM(valor) AS total FROM pagamentos WHERE comanda = ? AND ordem = ? AND dia = ? AND (tipo = ? OR tipo = ?)', fcomanda, ordem,dia,'normal','desconto')
            preco_pago = 0
            if valor_pago and valor_pago[0]['total']:
                preco_pago = float(valor_pago[0]['total'])
            
            total_comanda = db.execute('SELECT SUM(preco) AS total FROM pedidos WHERE comanda = ? AND ordem = ? AND dia = ?', fcomanda, ordem,dia)
            preco_total = 0
            if total_comanda and total_comanda[0]['total']:
                print(total_comanda)
                preco_total = float(total_comanda[0]['total'])

                dados = db.execute('''
                    SELECT pedido,id,ordem,nome,extra, SUM(quantidade) AS quantidade, SUM(preco) AS preco
                    FROM pedidos WHERE comanda =? AND ordem = ? AND dia = ? GROUP BY pedido, (preco/quantidade)
                ''', fcomanda, ordem,dia)
                nomes = db.execute(
                    'SELECT nome FROM pedidos WHERE comanda = ? AND ordem = ? AND nome != ? AND dia = ? GROUP BY nome', fcomanda, ordem, '-1',dia)
             
                preco_a_pagar = preco_total-preco_pago
                emit('preco', {'preco_a_pagar': preco_a_pagar, 'preco_total': preco_total, 'preco_pago': preco_pago,
                               'dados': dados, 'comanda': fcomanda, 'nomes': nomes}, broadcast=True)
            else:
                emit('preco', {'preco_a_pagar': '', 'preco_total': '', 'preco_pago': '', 'dados': '', 'nomes': '',
                               'comanda': fcomanda},broadcast=True)
        else:
            dados = db.execute('''
                    SELECT pedido,id,ordem,nome,extra, SUM(quantidade) AS quantidade, SUM(preco) AS preco
                    FROM pedidos WHERE comanda =? AND ordem = ? AND dia = ? GROUP BY pedido, (preco/quantidade)
                ''', fcomanda, ordem,dia)
            emit('preco', {'preco_a_pagar': '', 'preco_total': '', 'preco_pago': '', 'dados': dados, 'nomes': '',
                           'comanda': fcomanda}, broadcast=True)
        getPedidos(True)
        getComandas(True)


    except Exception as e:
        print("Erro ao calcular preço:", e)




@socketio.on('permitir')
def permitir(data):
    id = data.get('id')
    # Corrigido para buscar 'numero', que está vindo do frontend
    numero = data.get('numero')
    db.execute('UPDATE usuarios SET liberado = ? WHERE id = ?',
               numero, id)  # Atualiza a coluna 'liberado'
    users(True)



@socketio.on('Delete_user')
def delete_user(data):
    id = data.get('id')
    db.execute('DELETE FROM usuarios WHERE id = ?',id)
    users(True)

@socketio.on('cadastrar')
def cadastro(data):
    print('entrou')
    username = data.get('username')
    cargo = data.get('cargo')
    print(username)
    senha = data.get('senha')
    print(senha)
    db.execute('INSERT INTO usuarios (username,senha,cargo,liberado) VALUES (?,?,?,?)',
               username, senha, cargo, '1')
    print('sucesso'
          )
    users(True)


@socketio.on('adicionarCardapio')
def adicionarCardapio(data):
    print(data.get('opcoes'))
    item = data.get('item')
    preco = data.get('preco')
    categoria = data.get('categoria')
    usuario = data.get('username')
    token_user = data.get('token')
    if not item or not preco or not categoria:
        emit('Erro',{'Alguma categoria faltando'})
    else:
        alteracoes = f'item: {item} preco: {preco} categoria: {categoria}'
        if categoria != 'Restante':
            opcoes = data.get('opcoes')
            if categoria == 'Bebida':
                categoria_id = 2
            elif categoria == 'Porção':
                categoria_id = 3
            opcoesFormatadas = ''
            for row in opcoes:
                opcoesFormatadas+=row['titulo']
                print (opcoesFormatadas)
                opcoesFormatadas+='('
                for i in range(len(row['conteudo'])):
                    opcoesFormatadas+=row['conteudo'][i]
                    if i != len(row['conteudo'])-1:
                        opcoesFormatadas+='-'
                opcoesFormatadas+=')'
            if opcoesFormatadas:
                alteracoes+=f' opcoes {opcoesFormatadas}'
            db.execute('INSERT INTO cardapio (item,categoria_id,preco,opcoes) VALUES(?,?,?,?)',item,categoria_id,float(preco),opcoesFormatadas)  
        else:
            db.execute('INSERT INTO cardapio (item,categoria_id,preco) VALUES (?,?,?)',item,1,float(preco))

        insertAlteracoesTable('Cardapio',alteracoes,'Adicionou','Tela Cardapio',usuario)
        alteracoes=f"{usuario} Adicionou {alteracoes}"
        enviar_notificacao_expo('ADM','Item Adicionado Cardapio',alteracoes,token_user)
        getCardapio(True)                 



@socketio.on('editarCardapio')
def editarCardapio(data):
    item = data.get('item')
    preco = data.get('preco')
    categoria = data.get('categoria')
    novoNome = data.get('novoNome')
    opcoes = data.get('opcoes')
    usuario = data.get('username')
    token_user=data.get('token')
    
    
    


    if item and preco and categoria:
        alteracoes = f'{item}, '
        dadoAntigo = db.execute('SELECT * FROM cardapio WHERE item = ?',item)[0]
        if categoria == 'Restante':
            categoria_id = 1
        elif categoria =='Porção':
            categoria_id= 3
        elif categoria == 'Bebida':
            categoria_id = 2
        opcoesFormatadas = ''
        
        if opcoes:
            for row in opcoes:
                opcoesFormatadas+=row['titulo']
                print (opcoesFormatadas)
                opcoesFormatadas+='('
                for i in range(len(row['conteudo'])):
                    opcoesFormatadas+=row['conteudo'][i]
                    if i != len(row['conteudo'])-1:
                        opcoesFormatadas+='-'
                opcoesFormatadas+=')'
        if opcoesFormatadas and novoNome:
            db.execute("UPDATE cardapio SET item =?,preco=?,categoria_id=?,opcoes=? WHERE item = ?",novoNome,preco,categoria_id,opcoesFormatadas,item)
        elif opcoesFormatadas:
            db.execute("UPDATE cardapio SET preco=?,categoria_id=?,opcoes=? WHERE item = ?",preco,categoria_id,opcoesFormatadas,item)
        elif novoNome:
            db.execute("UPDATE cardapio SET item =?,preco=?,categoria_id=? WHERE item = ?",novoNome,preco,categoria_id,item)
        else:
            db.execute("UPDATE cardapio SET preco=?,categoria_id=? WHERE item = ?",preco,categoria_id,item)
        
        dadoAtualizado = db.execute('SELECT * FROM cardapio WHERE item = ?',novoNome)[0] if novoNome else db.execute('SELECT * FROM cardapio WHERE item = ?',item)[0]
        
        dif={k:(dadoAtualizado[k],dadoAntigo[k]) for k in dadoAtualizado.keys() & dadoAntigo.keys() if dadoAtualizado[k]!=dadoAntigo[k]}.keys()
        for key in dif:
            alteracoes+=f'{key} de {dadoAntigo[key]} para {dadoAtualizado[key]} '
        print(alteracoes)

        insertAlteracoesTable('Cardapio',alteracoes,'Editou','Tela Cardapio',usuario)
        alteracoes=f"{usuario} Editou {alteracoes}"
        enviar_notificacao_expo('ADM','Cardapio editado',alteracoes,token_user)
        getCardapio(True)
  

@socketio.on('removerCardapio')
def removerCardapio(data):
    item=data.get('item')
    usuario = data.get('username')
    token_user = data.get('token')
    print("Removendo item:", item)
    db.execute("DELETE FROM cardapio WHERE item=?",item)

    insertAlteracoesTable('Cardapio',item,'Removeu','Tela Cardapio',usuario)
    enviar_notificacao_expo('ADM','Item Removido Cardapio',f"{usuario} Removeu {item} do Cardapio",token_user)
    getCardapio(True)
    


@socketio.on('getItemCardapio')
def getItemCardapio(data):
    item = data.get('item')
    print(item) 
    opcoes = db.execute('SELECT opcoes FROM cardapio WHERE item = ?', item)
    if opcoes:
        palavra = ''
        selecionaveis = []
        dados = []
        for i in opcoes[0]['opcoes']:
            if i == '(':
                nome_selecionavel = palavra
                print(nome_selecionavel)
                palavra = ''
            elif i == '-':
                selecionaveis.append(palavra)
                palavra = ''
            elif i == ')':
                selecionaveis.append(palavra)
                dados.append({'titulo':nome_selecionavel,'conteudo':selecionaveis})
                selecionaveis = []
                palavra = ''
            else:
                palavra += i

        print(dados)
        emit('respostaGetItemCardapio',{'opcoes':dados})

def insertAlteracoesTable(tabela,alteracao,tipo,tela,usuario):
    hoje = datetime.now(brazil).date()
    horario = datetime.now(pytz.timezone(
        "America/Sao_Paulo")).strftime('%H:%M')
    print(tabela,alteracao,tipo,usuario)
    db.execute('INSERT INTO alteracoes (tabela,alteracao,tipo,usuario,tela,dia,horario) VALUES (?,?,?,?,?,?,?)',tabela,alteracao,tipo,usuario,tela,hoje,horario)
    getAlteracoes(True)

@socketio.on('getAlteracoes')
def getAlteracoes(emitir):
    print("Entrou GEtalteracoes")
    if type(emitir)!=bool:
        emiti=emitir.get('emitir')
        change=emitir.get('change')
        hoje = datetime.now(brazil).date() + timedelta(days=int(change))
        dia_mes = hoje.strftime('%d/%m')
    else:
        emiti = emitir
        hoje = datetime.now(brazil).date()
        dia_mes = hoje.strftime('%d/%m')

    data=db.execute("SELECT * FROM alteracoes WHERE dia = ?",hoje)
    emit('respostaAlteracoes', {"alteracoes":data,"hoje":str(dia_mes)}, broadcast=emiti)


#Larissaaa:
@socketio.on("getDados")
def getDados():
    print('get dados')
    todos_dados=db.execute("SELECT * FROM larissa_itens")
    print("todos os dados",todos_dados)
    emit("RespostaPesquisa",todos_dados,broadcast=True)

@socketio.on("getDadosPedidos")
def getDadosPedidos():
    print('get dados')
    todos_dados=db.execute("SELECT * FROM larissa_pedidos")
    print("todos os dados",todos_dados)
    emit("RespostaPedidos",todos_dados,broadcast=True)
    get_faturamento()

@socketio.on('SaveAlteracoesPedidos')
def save_alteracoes_pedidos(data):
    print('entrou savealteracoespedidos')
    id = data.get('id', '')
    item = data.get('item', '')
    link = data.get('link', '')
    nome_loja = data.get('loja')
    categoria = data.get('categoria', '')
    imagem = data.get('imagem', '')
    endereco = data.get('endereco', '')
    dia_da_compra = data.get('dia_da_compra', '')
    previsao_entrega = data.get('previsao_entrega')
    preco_de_venda = float(data.get('preco_de_venda',0))
    preco_de_custo = float(data.get('preco_de_custo', 0))
    print('vai update o db')
    db.execute('UPDATE larissa_pedidos SET item=?,link=?,loja=?,categoria=?,imagem=?,endereco=?,dia_da_compra=?,previsao_entrega=?,preco_de_venda=?,preco_de_custo=? WHERE id = ?',item,link,nome_loja,categoria,imagem,endereco,dia_da_compra,previsao_entrega,preco_de_venda,preco_de_custo,id)
    getDadosPedidos()
    get_faturamento()
    
@socketio.on("SaveAlteracoes")
def saveAlteracoese(data):
    id=data['id']
    item=data['item']
    link=data['link']
    nomeLoja=data['loja']
    categoria=data['categoria']
    imagem=data['imagem']
    preco_de_custo = data.get('preco_de_custo',0)
    preco=data.get('preco_de_venda', preco_de_custo)
    db.execute("UPDATE larissa_itens SET item=?,preco_de_venda=?,link=?,loja=?,categoria=?,imagem=?,preco_de_custo=? WHERE id=?",item,preco,link,nomeLoja,categoria,imagem,preco_de_custo,id)
    getDados

@socketio.on("ExcluirPedido")
def ExcluirPedido(data):
    id=data['id']
    db.execute("DELETE FROM larissa_pedidos WHERE id=?", id)
    print(f"excluir o pedido  {data['item']} de {data['nome_comprador']}")
    getDadosPedidos()
    get_faturamento()

@socketio.on("ExcluirItem")
def ExcluirPedido(data):
    id=data['id']
    db.execute("DELETE FROM larissa_itens WHERE id=?", id)
    getDados()
    get_faturamento()

@socketio.on('AdicionarNovoPedido')
def adicionar_novo_pedido(data):
    print('entrou adicionar novo pedido')
    agora = datetime.now(brazil).date()
    dia = agora.strftime('%d-%m-%Y')
    itemCompleto = data.get('itemOriginal',{})
    item = itemCompleto.get('item', '')
    categoria = itemCompleto.get('categoria', '')
    loja = itemCompleto.get('loja', '')
    imagem=itemCompleto.get('imagem','')
    link = itemCompleto.get('link', '')
    comprador = data.get('comprador', '')
    telefone = data.get('telefone', '')
    endereco = data.get('endereco','')
    previsao=data.get('previsao','')
    preco_de_custo=itemCompleto.get('preco_de_custo',0)
    preco_de_venda=itemCompleto.get('preco_de_venda',preco_de_custo)
    print("peguei o custo:", preco_de_custo)
    db.execute('INSERT INTO larissa_pedidos (item,nome_comprador,numero_telefone,dia_da_compra,categoria,loja,link,previsao_entrega,endereco,imagem,preco_de_venda,state,preco_de_custo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',item,comprador,telefone,dia,categoria,loja,link,previsao,endereco,imagem,preco_de_venda,'pendente',preco_de_custo)
    getDadosPedidos()
    get_faturamento()

@socketio.on("GetCategoriaLoja")
def getCategoriaLojas():
    print("entrou no gett")
    dados=db.execute("SELECT DISTINCT categoria,loja FROM larissa_itens")
    print("dados:",dados)
    emit("RespostaCategoriaLoja",dados)

@socketio.on('get-faturamento')
def get_faturamento():
    try:
        dados = db.execute('SELECT SUM(preco_de_venda) as faturamento, SUM(preco_de_venda-preco_de_custo) as lucro, COUNT(*) as vendas, COUNT(*) FILTER( WHERE state = ? )as entregues, COUNT(*) FILTER (WHERE state = ?) as pendentes FROM larissa_pedidos','entregue','pendente')
        
        dados_row = dados[0]
        faturamento = dados_row.get('faturamento', 'Sem Faturamento')
        lucro = dados_row.get('lucro','Sem Lucro')
        if faturamento:
            faturamento = round(faturamento,2)
        if lucro:
            lucro = round(lucro,2)
        vendas = dados_row.get('vendas', 'Sem Vendas')
        pedidos_entregues = dados_row.get('entregues', 'Sem pedidos')
        pedidos_pendentes = dados_row.get('pendentes', 'Sem pedidos')
        emit('resposta-get-faturamento', {
                    'faturamento': faturamento,
                    'lucro': lucro,
                    'vendas': vendas,
                    'pedidos_entregues': pedidos_entregues,
                    'pedidos_pendentes': pedidos_pendentes,
                    },broadcast=True)                  

    except Exception as e:
        print ('erro no get-faturamento', e)
        emit('resposta-get-faturamento',{'faturamento':'Sem Faturamento','lucro':'Sem lucro','vendas':'Sem Vendas'})

@socketio.on('change-pedidos-state')
def change_pedido_state(id,state):
    print ('id', id)
    db.execute('UPDATE larissa_pedidos SET state = ? WHERE id = ?', state, id)
    getDadosPedidos()
    get_faturamento()

@socketio.on('AdicionarItem')
def adicionarItem(data):
    print('entrouuuuu')
    item=data['item']
    link=data.get("link", 'sem link')
    imagem=data.get('imagem', '')
    nomeLoja=data['selectedLoja']
    categoria=data['selectedCategoria']
    preco_de_custo = data.get('preco_de_custo', 0)
    preco_de_venda = data.get('preco', preco_de_custo*2)
    db.execute("INSERT INTO larissa_itens (item, preco_de_venda, link, loja, categoria, imagem, preco_de_custo) VALUES (?, ?, ?, ?, ?, ?,?)",item,preco_de_venda,link,nomeLoja,categoria,imagem,preco_de_custo)
    print("item guardado")
    getDados()

import re
from flask_socketio import emit  # ou use socketio.emit se preferir

@socketio.on('buscar_menu_data')
def buscar_menu_data(emitir_broadcast):
    try:
        print('entrou buscar menu data')

        data_geral = db.execute(
            '''
            SELECT id, item, preco, categoria_id, image, options_on_qr, name_on_qr, subcategoria
            FROM cardapio
            WHERE usable_on_qr = ?
            ORDER BY name_on_qr ASC
            ''',
            1
        )


        data_geral_atualizado = []
        for row in data_geral:
            item_nome = (row.get('name_on_qr') or '').strip()
            if not item_nome:
                continue

            cat_id = row.get('categoria_id')

            # Classificação
            if (cat_id in (1, 2)) and (item_nome not in ['amendoim', 'milho', 'Pack de seda', 'cigarro', 'bic', 'dinheiro']) and not item_nome.startswith('acai'):
                categoria_item = 'bebida'
            elif (cat_id == 3) or (item_nome in ['amendoim', 'milho']) or (item_nome.startswith('acai')):
                categoria_item = 'comida'
            else:
                categoria_item = 'outros'

            # --- Coalesce seguro para options_on_qr ---
            opcoes_str = row.get('options_on_qr')
            if opcoes_str is None:
                opcoes_str = ''
            elif not isinstance(opcoes_str, str):
                opcoes_str = str(opcoes_str)

            # pega "Titulo(conteudo)" sem ser guloso além do próximo ')'
            matches = re.findall(r'([A-Za-zÀ-ÿ\' ]+)\(([^)]*)\)', opcoes_str)

            options = {}
            for opt_key, conteudo in matches:
                itens = [i.strip() for i in conteudo.split('-') if i.strip()]
                options[opt_key.strip()] = itens

            data_geral_atualizado.append({
                'id': row['id'],
                'name': item_nome,
                'price': row.get('preco'),
                'categoria': categoria_item,
                'subCategoria': row.get('subcategoria','outros'),
                'image': row.get('image') or None,
                'options': options
            })

        emit('menuData', data_geral_atualizado, broadcast=emitir_broadcast)

    except Exception as e:
        print('erro ao buscar_menu_data:', e)

@socketio.on('enviar_pedido_on_qr')
def enviar_pedido_on_qr(data,comanda):
    print(f'enviar pedido on qr:\n {data}')
    print(f'comanda {comanda}')
    dia = datetime.now(brazil).date()
    for row in data:
        subcategoria = row.get('subcategoria')
        pedido_dict = db.execute('SELECT item FROM cardapio WHERE id = ?',row.get('id'))
        if pedido_dict:
            pedido = pedido_dict[0].get('item')
        preco = float(row.get('price'))
        categoria = row.get('categoria')
        quantidade = row.get('quantity')
        options = row.get('selectedOptions')
        obs = row.get('observations')
        extra = ''
        if categoria=='comida':
            if pedido not in ['amendoim', 'milho']:
                categoria_id = 1
            elif pedido.startswith('acai'):
                categoria_id = 2
            else :
                categoria_id = 3
        else:
            if subcategoria in ['outros,cervejas']:
                categoria_id = 1
            else:
                categoria_id = 2

        agr = datetime.now()
        hora_min = agr.strftime("%H:%M")
        extra = None
        if options:
            extra = auxiliar_dicionario_para_string(options)
            if obs:
                extra = (extra + ", " + 'Obs: '+ obs).strip(", ")
        elif obs:
            extra = obs

        db.execute('''INSERT INTO pedidos (comanda,pedido,quantidade,extra,preco,categoria,inicio,estado,nome,ordem,dia)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)''',comanda,pedido,quantidade,extra, preco,categoria_id,hora_min,'A Fazer','-1',0,dia)


def auxiliar_dicionario_para_string(options):
    try:
        limpo = {}
        for k, v in options.items():
            if isinstance(v, str):
                val = re.sub(r'\+\d+(?:[.,]\d+)?$', '', v).replace('+', ' ').strip()
                limpo[k] = val
            elif isinstance(v, list):
                limpo[k] = [re.sub(r'\+\d+(?:[.,]\d+)?$', '', item).replace('+', ' ').strip() for item in v]
            else:
                limpo[k] = v

        parts = []
        for k, v in limpo.items():
            if isinstance(v, list):
                for item in v:
                    if item:
                        parts.append(f"{k}: {item}")
            else:
                if v:
                    parts.append(f"{k}: {v}")

        extra = ", ".join(parts)
        return extra
    except Exception as e:
        print('erro_auxiliar_dicionario_para_string:', e)


@socketio.on('invocar_atendente')
def invocar_antendente(data):
    comanda = data.get('comanda')
    hoje = datetime.now()
    status = data.get('status')
    #horario = hoje.strftime('')
    
    #db.execute('INSERT into invocações_atendentes (comanda,horario,status,dia) VALUES (?,?,?,?)',)
        
    return {'status':'atendente_chamado'},200






if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8000))

    socketio.run(app, host='0.0.0.0', port=port, debug=True)





