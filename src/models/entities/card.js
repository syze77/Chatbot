const Call = require('./call.js')
const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');

const Card = sequelize.define(
    'card',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        link: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('PENDING', 'COMPLETED'),
            allowNull: false,
            defaultValue: 'PENDING',
        },
    },
    {
        timestamps: false,
    }
);

Card.hasOne(Call);

module.exports = Card;