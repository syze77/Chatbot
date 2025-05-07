const User = require('./user.js');
const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');

const UserTelephone = sequelize.define(
    'usertelephone',
    {
        idUser: {
            type: DataTypes.BIGINT,
            references: {
                model: User,
                key: 'id',
                
            },
            primaryKey: true,
        },
        telephone: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    },
);

module.exports = UserTelephone;
